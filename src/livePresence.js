import * as THREE from 'three';

const MAX_REMOTE_EXPLORERS = 200;
const MAX_REMOTE_LABELS = 6;
const MOVEMENT_EVENT = 'move';
const POSITION_EPSILON = 1.35;
const MOBILE_POSITION_EPSILON = 2.1;
const ROTATION_EPSILON = 0.026;
const MOBILE_ROTATION_EPSILON = 0.045;
const PRESENCE_HEARTBEAT_MS = 9000;
const STALE_FADE_MS = 7000;
const STALE_REMOVE_MS = 24000;
const INTERPOLATION_DELAY_DESKTOP_MS = 140;
const INTERPOLATION_DELAY_MOBILE_MS = 190;
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;
const USER_NAME_MAX_LENGTH = 24;
const LEAVE_TOMBSTONE_MS = 10000;
const REMOTE_EYE_OFFSET = 3.2;
const REMOTE_DIRECTION_MARKER_FORWARD_OFFSET = 4.8;
const REMOTE_DIRECTION_MARKER_Y_OFFSET = -4.5;
const REMOTE_DIRECTION_MARKER_SCALE = 0.42;
const CONNECTION_LABELS = {
  initialized: 'Joining live world',
  connecting: 'Joining live world',
  connected: 'Live world',
  disconnected: 'Reconnecting',
  suspended: 'Live paused',
  closing: 'Leaving live world',
  closed: 'Solo mode',
  failed: 'Solo mode',
  solo: 'Solo mode'
};

export function createLivePresence({
  scene,
  camera,
  world,
  getSnapshot,
  onStateChange = () => {},
  isReducedMotion = () => false
}) {
  const isMobilePointer = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;
  const layer = new RemoteExplorersLayer({ camera, world, isMobilePointer, isReducedMotion });
  scene.add(layer.group);

  let client = null;
  let AblyModule = null;
  let presenceChannel = null;
  let channels = null;
  let identity = null;
  let localUserName = '';
  let started = false;
  let visible = !document.hidden;
  let seq = 0;
  let lastSentAt = 0;
  let lastPresenceAt = 0;
  let lastPresenceKey = '';
  let lastSnapshot = null;
  let lastRosterSignature = '';
  let publishInFlight = false;
  let currentMovementChannelName = null;
  let retryTimer = null;
  let retryDelay = RETRY_MIN_MS;
  let presenceCountRefreshTimer = null;
  const movementChannels = new Map();
  const channelHandlers = new Map();
  const participants = new Map();
  const recentLeaves = new Map();
  const state = {
    status: 'solo',
    statusLabel: CONNECTION_LABELS.solo,
    onlineCount: 0,
    remoteCount: 0,
    visitorsVisible: true,
    identity: null,
    participants: []
  };

  const api = {
    group: layer.group,
    start,
    update,
    setVisitorsVisible,
    setDisplayName,
    getVisitorTargetPose,
    pickVisitorAt,
    forcePublish,
    dispose
  };

  window.addEventListener('online', () => {
    setStatus(client ? client.connection.state : 'connecting');
    scheduleRetry(true);
  });
  window.addEventListener('offline', () => setStatus('solo'));
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);

  return api;

  async function start() {
    if (started || client) return;
    started = true;
    setStatus('connecting');

    let firstAuth;
    try {
      firstAuth = await fetchAuth();
      AblyModule = await import('ably');
    } catch {
      enterSoloMode();
      started = false;
      scheduleRetry();
      return;
    }

    channels = firstAuth.channels;
    setIdentity(firstAuth.client);
    let cachedAuth = firstAuth;

    try {
      client = new AblyModule.Realtime({
        authCallback: async (_params, callback) => {
          try {
            const auth = cachedAuth ?? await fetchAuth();
            cachedAuth = null;
            channels = auth.channels;
            setIdentity(auth.client);
            callback(null, auth.tokenRequest);
          } catch (error) {
            callback(error);
          }
        },
        autoConnect: true,
        queueMessages: false,
        closeOnUnload: true,
        logLevel: 1
      });

      client.connection.on((change) => {
        setStatus(change.current);
        if (change.current === 'connected') {
          void handleConnected();
        }
        if (change.current === 'failed' || change.current === 'suspended') {
          layer.markDisconnected();
        }
      });
    } catch {
      enterSoloMode();
      started = false;
      scheduleRetry();
    }
  }

  function update(now, delta) {
    layer.update(now, delta, participants);
    removeStaleParticipants(now);
    publishMovementIfNeeded(now);
  }

  function setVisitorsVisible(nextVisible) {
    state.visitorsVisible = Boolean(nextVisible);
    layer.setVisible(state.visitorsVisible);
    emitState();
  }

  function setDisplayName(nextUserName) {
    localUserName = sanitizeUserName(nextUserName);
    updateIdentityState();
    lastPresenceKey = '';
    forceNextMovement();
    if (client?.connection.state === 'connected' && presenceChannel) {
      const snapshot = readSnapshot(performance.now());
      if (snapshot) void enterOrUpdatePresence(false, snapshot);
    }
  }

  function getVisitorTargetPose(visitorKeyOrClientId, now = performance.now()) {
    const participant = resolveTargetableParticipant(visitorKeyOrClientId, now);
    return participant ? layer.getTargetPose(participant.key, now, participant) : null;
  }

  function pickVisitorAt(clientX, clientY, domElement, now = performance.now()) {
    return layer.pickVisitorAt(clientX, clientY, domElement, now);
  }

  function forcePublish(now = performance.now()) {
    forceNextMovement();
    publishMovementIfNeeded(now);
  }

  function dispose() {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', handlePageHide);
    if (retryTimer) window.clearTimeout(retryTimer);
    if (presenceCountRefreshTimer) window.clearTimeout(presenceCountRefreshTimer);
    try {
      presenceChannel?.presence.leave();
      client?.close();
    } catch {
      // Best-effort shutdown only.
    }
    layer.dispose();
  }

  async function fetchAuth() {
    const response = await fetch('/api/ably-token', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (!response.ok) throw new Error(`Live auth failed with ${response.status}`);
    const auth = await response.json();
    if (!auth?.tokenRequest || !auth?.channels?.namespace || !auth?.client?.clientId) {
      throw new Error('Live auth response was incomplete');
    }
    return auth;
  }

  function setIdentity(nextIdentity) {
    identity = nextIdentity;
    updateIdentityState();
  }

  function updateIdentityState() {
    const displayId = localDisplayId();
    state.identity = displayId
      ? {
          displayId,
          userName: localUserName,
          name: formatVisitorName(localUserName, displayId)
        }
      : null;
    emitState();
  }

  function localDisplayId() {
    return sanitizeDisplayId(identity?.displayId) || displayIdFromClientId(identity?.clientId);
  }

  async function attachChannels() {
    if (!client || !channels || presenceChannel) return;

    presenceChannel = client.channels.get(channels.presence);
    await presenceChannel.presence.subscribe(handlePresenceMessage);
    const members = await presenceChannel.presence.get();
    reconcilePresenceMembers(members);
    await syncMovementSubscriptions(lastSnapshot?.cityId ?? readSnapshot(performance.now())?.cityId ?? 'between');
  }

  async function handleConnected() {
    try {
      await attachChannels();
      await enterOrUpdatePresence(true);
      forceNextMovement();
      retryDelay = RETRY_MIN_MS;
      await updatePresenceCountFromChannel();
    } catch {
      setStatus('disconnected');
    }
  }

  async function subscribeMovementChannel(cityId) {
    const channelName = movementChannelName(cityId);
    if (movementChannels.has(channelName)) return;
    const channel = client.channels.get(channelName);
    const handler = (message) => handleMovementMessage(message);
    movementChannels.set(channelName, channel);
    channelHandlers.set(channelName, handler);
    await channel.subscribe(MOVEMENT_EVENT, handler);
  }

  async function syncMovementSubscriptions(cityId) {
    if (!client || !channels) return;
    const desired = new Set(['between', cityId || 'between']);
    for (const desiredCityId of desired) await subscribeMovementChannel(desiredCityId);

    for (const [channelName, channel] of movementChannels) {
      if (desired.has(cityIdFromMovementChannel(channelName))) continue;
      const handler = channelHandlers.get(channelName);
      if (handler) await channel.unsubscribe(MOVEMENT_EVENT, handler);
      channelHandlers.delete(channelName);
      movementChannels.delete(channelName);
    }
  }

  function movementChannelName(cityId) {
    const safeCity = String(cityId || 'between').replace(/[^a-zA-Z0-9_-]/g, '-');
    return `${channels.namespace}:city:${safeCity}:movement`;
  }

  function cityIdFromMovementChannel(channelName) {
    const prefix = `${channels.namespace}:city:`;
    if (!channelName.startsWith(prefix) || !channelName.endsWith(':movement')) return null;
    return channelName.slice(prefix.length, -':movement'.length);
  }

  function handlePresenceMessage(message, options = {}) {
    if (message.clientId === identity?.clientId && message.connectionId === client?.connection.id) return;

    const key = actorKey(message);
    if (message.action === 'leave' || message.action === 3) {
      markActorLeft(key, performance.now());
      participants.delete(key);
      layer.remove(key);
      refreshParticipants();
      return;
    }

    const data = normalizePresenceData(message.data, message.clientId);
    if (!data) return;
    recentLeaves.delete(key);
    const existing = participants.get(key);
    const stalePresence = existing?.seq > data.seq;
    upsertParticipant(key, {
      clientId: message.clientId,
      connectionId: message.connectionId,
      displayId: data.displayId,
      name: preferredVisitorName(existing, data),
      color: sanitizeColor(data.color),
      cityId: stalePresence ? existing.cityId : data.cityId,
      cityName: stalePresence ? existing.cityName : data.cityName,
      mode: stalePresence ? existing.mode : data.mode,
      pose: stalePresence ? null : data.pose,
      seq: Math.max(existing?.seq ?? -1, data.seq),
      receivedAt: performance.now(),
      lastPresenceAt: performance.now(),
      presenceActive: true
    });

    if (!options.skipCountRefresh) schedulePresenceCountRefresh();
  }

  function schedulePresenceCountRefresh() {
    if (presenceCountRefreshTimer) return;
    presenceCountRefreshTimer = window.setTimeout(() => {
      presenceCountRefreshTimer = null;
      void updatePresenceCountFromChannel();
    }, 900);
  }

  async function updatePresenceCountFromChannel() {
    if (!presenceChannel) return;
    try {
      const members = await presenceChannel.presence.get();
      reconcilePresenceMembers(members);
    } catch {
      syncVisibleOnlineCount(true);
    }
  }

  function reconcilePresenceMembers(rawMembers) {
    const members = Array.isArray(rawMembers) ? rawMembers : rawMembers?.items ?? [];
    const activeKeys = new Set(members.map((member) => actorKey(member)));
    let changed = false;

    for (const member of members) {
      handlePresenceMessage(member, { skipCountRefresh: true });
    }

    for (const [key] of participants) {
      if (activeKeys.has(key)) continue;
      markActorLeft(key, performance.now());
      participants.delete(key);
      layer.remove(key);
      changed = true;
    }

    if (changed) refreshParticipants();
    else syncVisibleOnlineCount(true);
  }

  function handleMovementMessage(message) {
    if (message.clientId === identity?.clientId && (message.connectionId ?? message.data?.cid) === client?.connection.id) return;
    const data = normalizeMovementData(message.data, message.clientId);
    if (!data) return;

    const key = actorKey({
      clientId: message.clientId,
      connectionId: message.connectionId ?? data.cid
    });
    if (isRecentlyLeft(key, performance.now())) return;
    const existing = participants.get(key);
    if (existing?.seq >= data.seq) return;

    upsertParticipant(key, {
      clientId: message.clientId,
      connectionId: message.connectionId ?? data.cid,
      displayId: data.displayId ?? existing?.displayId,
      name: preferredVisitorName(existing, data),
      color: existing?.color ?? sanitizeColor(data.color),
      cityId: data.cityId,
      cityName: data.cityName,
      mode: data.mode,
      pose: data.pose,
      seq: data.seq,
      speed: data.speed,
      moving: data.moving,
      receivedAt: performance.now(),
      lastMovementAt: performance.now()
    });
  }

  function upsertParticipant(key, patch) {
    const existing = participants.get(key) ?? {
      key,
      samples: [],
      createdAt: performance.now(),
      lastMovementAt: 0,
      lastPresenceAt: 0,
      seq: -1
    };
    Object.assign(existing, patch);
    if (patch.pose) layer.addSample(existing, patch.pose, patch.receivedAt ?? performance.now());
    participants.set(key, existing);
    refreshParticipants();
  }

  function refreshParticipants() {
    const now = performance.now();
    const groupedVisitors = new Map();
    for (const participant of participants.values()) {
      const visitor = participantListView(participant, now);
      const groupKey = participant.clientId || participant.displayId || participant.key;
      const current = groupedVisitors.get(groupKey);
      if (!current || isPreferredRosterVisitor(visitor, current)) groupedVisitors.set(groupKey, visitor);
    }

    const list = [...groupedVisitors.values()]
      .sort(compareRosterVisitors)
      .slice(0, 12);
    const nextRemoteCount = groupedVisitors.size;
    const nextOnlineCount = visibleOnlineCount(nextRemoteCount);
    const nextSignature = rosterSignature(list, nextRemoteCount);
    if (nextSignature === lastRosterSignature && state.remoteCount === nextRemoteCount && state.onlineCount === nextOnlineCount) return;

    lastRosterSignature = nextSignature;
    state.remoteCount = nextRemoteCount;
    state.onlineCount = nextOnlineCount;
    state.participants = list;
    emitState();
  }

  function participantListView(participant, now = performance.now()) {
    const displayId = participant.displayId ?? displayIdFromClientId(participant.clientId);
    return {
      key: participant.clientId || participant.key,
      targetKey: participant.key,
      clientId: participant.clientId,
      connectionId: participant.connectionId,
      displayId,
      name: participant.name ?? (displayId ? `Visitor #${displayId}` : 'Visitor'),
      color: participant.color,
      cityId: participant.cityId,
      cityName: participant.cityName || formatCityName(participant.cityId),
      mode: participant.mode || 'orbit',
      moving: Boolean(participant.moving),
      meetAvailable: isParticipantTargetable(participant, now),
      lastSeen: Math.max(participant.lastMovementAt || 0, participant.lastPresenceAt || 0, participant.createdAt || 0)
    };
  }

  function resolveTargetableParticipant(visitorKeyOrClientId, now = performance.now()) {
    if (!visitorKeyOrClientId) return null;

    const exact = participants.get(visitorKeyOrClientId);
    if (exact && isParticipantTargetable(exact, now)) return exact;

    let best = null;
    for (const participant of participants.values()) {
      if (participant.clientId !== visitorKeyOrClientId) continue;
      if (!isParticipantTargetable(participant, now)) continue;
      const lastSeen = Math.max(participant.lastMovementAt || 0, participant.lastPresenceAt || 0, participant.createdAt || 0);
      const bestLastSeen = best
        ? Math.max(best.lastMovementAt || 0, best.lastPresenceAt || 0, best.createdAt || 0)
        : -1;
      if (!best || lastSeen > bestLastSeen) best = participant;
    }
    return best;
  }

  function isParticipantTargetable(participant, now = performance.now()) {
    const lastSeen = Math.max(participant?.lastMovementAt || 0, participant?.lastPresenceAt || 0, participant?.createdAt || 0);
    return Boolean(participant?.key && now - lastSeen <= STALE_REMOVE_MS && layer.hasTargetPose(participant.key, now));
  }

  function isPreferredRosterVisitor(next, current) {
    if (next.meetAvailable !== current.meetAvailable) return next.meetAvailable;
    if (next.lastSeen !== current.lastSeen) return next.lastSeen > current.lastSeen;
    const nextHasCustomName = !isFallbackVisitorName(next.name, next.displayId);
    const currentHasCustomName = !isFallbackVisitorName(current.name, current.displayId);
    if (nextHasCustomName !== currentHasCustomName) return nextHasCustomName;
    return next.key.localeCompare(current.key) < 0;
  }

  function compareRosterVisitors(a, b) {
    const aId = a.displayId ?? '99999';
    const bId = b.displayId ?? '99999';
    if (aId !== bId) return aId.localeCompare(bId);
    return a.key.localeCompare(b.key);
  }

  function rosterSignature(list, totalCount) {
    return `${totalCount}|${list.map((visitor) => [
      visitor.key,
      visitor.displayId,
      visitor.name,
      visitor.color,
      visitor.cityId,
      visitor.cityName,
      visitor.mode,
      visitor.targetKey,
      visitor.meetAvailable
    ].join('~')).join('|')}`;
  }

  function visibleOnlineCount(remoteCount = state.remoteCount) {
    return state.status === 'connected' ? remoteCount + 1 : 0;
  }

  function syncVisibleOnlineCount(shouldEmit = false) {
    const nextOnlineCount = visibleOnlineCount();
    if (state.onlineCount === nextOnlineCount) return;
    state.onlineCount = nextOnlineCount;
    if (shouldEmit) emitState();
  }

  function publishMovementIfNeeded(now) {
    if (!client || !channels || client.connection.state !== 'connected' || !visible || publishInFlight) return;
    const snapshot = readSnapshot(now);
    if (!snapshot) return;

    const immediate = shouldSendImmediately(snapshot);
    const minInterval = 1000 / targetPublishHz();
    const heartbeatDue = now - lastSentAt > PRESENCE_HEARTBEAT_MS;
    if (!immediate && !heartbeatDue && now - lastSentAt < minInterval) return;

    publishInFlight = true;
    void publishSnapshot(snapshot, now, immediate || heartbeatDue).finally(() => {
      publishInFlight = false;
    });
  }

  async function publishSnapshot(snapshot, now, shouldUpdatePresence) {
    try {
      const channelName = movementChannelName(snapshot.cityId);
      currentMovementChannelName = channelName;
      await syncMovementSubscriptions(snapshot.cityId);
      const channel = movementChannels.get(channelName) ?? client.channels.get(channelName);
      movementChannels.set(channelName, channel);
      const payload = movementPayload(snapshot, now);
      await channel.publish(MOVEMENT_EVENT, payload);
      lastSentAt = now;
      lastSnapshot = snapshot;

      const presenceKey = `${snapshot.cityId}:${snapshot.mode}:${snapshot.moving}:${snapshot.userName}`;
      if (shouldUpdatePresence || presenceKey !== lastPresenceKey || now - lastPresenceAt > PRESENCE_HEARTBEAT_MS) {
        await enterOrUpdatePresence(false, snapshot);
        lastPresenceAt = now;
        lastPresenceKey = presenceKey;
      }
    } catch {
      if (client?.connection.state === 'connected') setStatus('disconnected');
    }
  }

  function publishFinalSnapshot() {
    if (!client || client.connection.state !== 'connected') return;
    const snapshot = readSnapshot(performance.now());
    if (!snapshot) return;
    snapshot.moving = false;
    void enterOrUpdatePresence(false, snapshot);
  }

  async function enterOrUpdatePresence(forceEnter = false, snapshot = readSnapshot(performance.now())) {
    if (!presenceChannel || !identity || !snapshot) return;
    const payload = presencePayload(snapshot);
    if (forceEnter) await presenceChannel.presence.enter(payload);
    else await presenceChannel.presence.update(payload);
  }

  function readSnapshot(now) {
    try {
      const raw = getSnapshot(now);
      if (!raw) return null;
      const bodyPosition = raw.bodyPosition ?? raw.position;
      const eyePosition = raw.eyePosition ?? raw.position ?? bodyPosition;
      const avatarQuaternion = raw.avatarQuaternion ?? raw.quaternion;
      const viewQuaternion = raw.viewQuaternion ?? raw.quaternion ?? avatarQuaternion;
      if (!bodyPosition || !eyePosition || !avatarQuaternion || !viewQuaternion) return null;
      return {
        cityId: raw.cityId || 'between',
        cityName: raw.cityName || formatCityName(raw.cityId),
        mode: raw.mode === 'flight' ? 'flight' : 'orbit',
        moving: Boolean(raw.moving),
        userName: sanitizeUserName(raw.userName),
        fps: Number(raw.fps) || 60,
        p: vectorPayload(bodyPosition),
        eye: vectorPayload(eyePosition),
        q: quaternionPayload(avatarQuaternion),
        vq: quaternionPayload(viewQuaternion)
      };
    } catch {
      return null;
    }
  }

  function vectorPayload(position) {
    return [
      round(position.x, 1),
      round(position.y, 1),
      round(position.z, 1)
    ];
  }

  function quaternionPayload(quaternion) {
    return [
      round(quaternion.x, 3),
      round(quaternion.y, 3),
      round(quaternion.z, 3),
      round(quaternion.w, 3)
    ];
  }

  function shouldSendImmediately(snapshot) {
    if (!lastSnapshot) return true;
    if (snapshot.cityId !== lastSnapshot.cityId || snapshot.mode !== lastSnapshot.mode || snapshot.moving !== lastSnapshot.moving || snapshot.userName !== lastSnapshot.userName) return true;
    const positionEpsilon = isMobilePointer ? MOBILE_POSITION_EPSILON : POSITION_EPSILON;
    const rotationEpsilon = isMobilePointer ? MOBILE_ROTATION_EPSILON : ROTATION_EPSILON;
    const dx = snapshot.p[0] - lastSnapshot.p[0];
    const dy = snapshot.p[1] - lastSnapshot.p[1];
    const dz = snapshot.p[2] - lastSnapshot.p[2];
    const dq = Math.abs(snapshot.q[0] - lastSnapshot.q[0]) +
      Math.abs(snapshot.q[1] - lastSnapshot.q[1]) +
      Math.abs(snapshot.q[2] - lastSnapshot.q[2]) +
      Math.abs(snapshot.q[3] - lastSnapshot.q[3]);
    const lastViewQuaternion = lastSnapshot.vq ?? lastSnapshot.q;
    const dvq = Math.abs(snapshot.vq[0] - lastViewQuaternion[0]) +
      Math.abs(snapshot.vq[1] - lastViewQuaternion[1]) +
      Math.abs(snapshot.vq[2] - lastViewQuaternion[2]) +
      Math.abs(snapshot.vq[3] - lastViewQuaternion[3]);
    return Math.hypot(dx, dy, dz) >= positionEpsilon || dq >= rotationEpsilon || dvq >= rotationEpsilon;
  }

  function targetPublishHz() {
    const base = isMobilePointer ? 4 : 6;
    if (lastSnapshot?.fps && lastSnapshot.fps < 45) return 3;
    const cityLoad = Math.max(1, [...participants.values()].filter((item) => item.cityId === lastSnapshot?.cityId).length + 1);
    return Math.max(2, Math.min(base, Math.floor(35 / cityLoad)));
  }

  function movementPayload(snapshot, now) {
    const nextSeq = ++seq;
    return {
      v: 1,
      seq: nextSeq,
      cid: client.connection.id,
      displayId: localDisplayId(),
      userName: snapshot.userName,
      name: formatVisitorName(snapshot.userName, localDisplayId()),
      color: identity?.color ?? '#f2c46d',
      cityId: snapshot.cityId,
      cityName: snapshot.cityName,
      mode: snapshot.mode,
      p: snapshot.p,
      eye: snapshot.eye,
      q: snapshot.q,
      vq: snapshot.vq,
      speed: estimateSpeed(snapshot, now),
      moving: snapshot.moving,
      t: Date.now()
    };
  }

  function presencePayload(snapshot) {
    return {
      v: 1,
      seq,
      displayId: localDisplayId(),
      userName: snapshot.userName,
      name: formatVisitorName(snapshot.userName, localDisplayId()),
      color: identity?.color ?? '#f2c46d',
      cityId: snapshot.cityId,
      cityName: snapshot.cityName,
      mode: snapshot.mode,
      pose: {
        p: snapshot.p,
        eye: snapshot.eye,
        q: snapshot.q,
        vq: snapshot.vq
      },
      moving: snapshot.moving,
      t: Date.now()
    };
  }

  function estimateSpeed(snapshot, now) {
    if (!lastSnapshot || !lastSentAt || now <= lastSentAt) return 0;
    const dx = snapshot.p[0] - lastSnapshot.p[0];
    const dy = snapshot.p[1] - lastSnapshot.p[1];
    const dz = snapshot.p[2] - lastSnapshot.p[2];
    return round(Math.hypot(dx, dy, dz) / ((now - lastSentAt) / 1000), 1);
  }

  function forceNextMovement() {
    lastSnapshot = null;
    lastSentAt = 0;
  }

  function handleVisibilityChange() {
    visible = !document.hidden;
    if (!visible) {
      publishFinalSnapshot();
      return;
    }
    forceNextMovement();
    if (client?.connection.state === 'connected') void enterOrUpdatePresence(true);
  }

  function handlePageHide() {
    visible = false;
    publishFinalSnapshot();
  }

  function scheduleRetry(immediate = false) {
    if (retryTimer || document.hidden || navigator.onLine === false || client) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      if (client || started) return;
      void start();
      retryDelay = Math.min(RETRY_MAX_MS, Math.round(retryDelay * 1.7));
    }, immediate ? 0 : retryDelay);
  }

  function setStatus(status) {
    const nextStatus = navigator.onLine === false ? 'solo' : status;
    state.status = nextStatus === 'connected'
      ? 'connected'
      : nextStatus === 'connecting' || nextStatus === 'initialized'
        ? 'connecting'
        : nextStatus === 'disconnected' || nextStatus === 'suspended'
          ? 'disconnected'
          : 'solo';
    state.statusLabel = CONNECTION_LABELS[nextStatus] ?? CONNECTION_LABELS.solo;
    syncVisibleOnlineCount(false);
    emitState();
  }

  function enterSoloMode() {
    state.onlineCount = 0;
    state.remoteCount = 0;
    state.participants = [];
    lastRosterSignature = '';
    participants.clear();
    layer.clear();
    setStatus('solo');
  }

  function removeStaleParticipants(now) {
    pruneRecentLeaves(now);
    let changed = false;
    for (const [key, participant] of participants) {
      const lastSeen = Math.max(participant.lastMovementAt || 0, participant.lastPresenceAt || 0);
      if (now - lastSeen > STALE_REMOVE_MS) {
        markActorLeft(key, now);
        participants.delete(key);
        layer.remove(key);
        changed = true;
      }
    }
    if (changed) refreshParticipants();
  }

  function markActorLeft(key, now) {
    recentLeaves.set(key, now);
  }

  function isRecentlyLeft(key, now) {
    const leftAt = recentLeaves.get(key);
    if (!leftAt) return false;
    if (now - leftAt > LEAVE_TOMBSTONE_MS) {
      recentLeaves.delete(key);
      return false;
    }
    return true;
  }

  function pruneRecentLeaves(now) {
    for (const [key, leftAt] of recentLeaves) {
      if (now - leftAt > LEAVE_TOMBSTONE_MS) recentLeaves.delete(key);
    }
  }

  function emitState() {
    onStateChange({ ...state });
  }
}

class RemoteExplorersLayer {
  constructor({ camera, world, isMobilePointer, isReducedMotion }) {
    this.camera = camera;
    this.world = world;
    this.isMobilePointer = isMobilePointer;
    this.isReducedMotion = isReducedMotion;
    this.group = new THREE.Group();
    this.group.name = 'live-remote-explorers';
    this.group.visible = true;
    this.records = new Map();
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'live-label-layer';
    this.labelLayer.setAttribute('aria-hidden', 'true');
    document.body.append(this.labelLayer);
    this.labels = Array.from({ length: MAX_REMOTE_LABELS }, () => {
      const label = document.createElement('div');
      label.className = 'live-label';
      label.hidden = true;
      this.labelLayer.append(label);
      return label;
    });

    const bodyGeometry = new THREE.CapsuleGeometry(2.1, 5.4, 4, 8);
    const arrowGeometry = new THREE.ConeGeometry(2.1, 5.4, 5);
    arrowGeometry.rotateX(-Math.PI / 2);
    const beaconGeometry = new THREE.CylinderGeometry(0.12, 0.12, 24, 6);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xf2c46d });
    const arrowMaterial = new THREE.MeshLambertMaterial({ color: 0x74b8c5 });
    const beaconMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe2a7,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });

    this.bodyMesh = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, MAX_REMOTE_EXPLORERS);
    this.arrowMesh = new THREE.InstancedMesh(arrowGeometry, arrowMaterial, MAX_REMOTE_EXPLORERS);
    this.beaconMesh = new THREE.InstancedMesh(beaconGeometry, beaconMaterial, MAX_REMOTE_EXPLORERS);
    this.bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beaconMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodyMesh.count = 0;
    this.arrowMesh.count = 0;
    this.beaconMesh.count = 0;
    this.group.add(this.beaconMesh, this.bodyMesh, this.arrowMesh);
    this.visibleRecords = [];
    this.raycaster = new THREE.Raycaster();
    this.pickPointer = new THREE.Vector2();

    this.tmpPosition = new THREE.Vector3();
    this.tmpNextPosition = new THREE.Vector3();
    this.tmpScale = new THREE.Vector3();
    this.tmpQuaternion = new THREE.Quaternion();
    this.tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.tmpMatrix = new THREE.Matrix4();
    this.tmpColor = new THREE.Color();
    this.arrowMixColor = new THREE.Color(0x74b8c5);
    this.identityQuaternion = new THREE.Quaternion();
    this.labelOffset = new THREE.Vector3(0, 10, 0);
    this.projected = new THREE.Vector3();
  }

  addSample(participant, pose, receivedAt) {
    const record = this.records.get(participant.key) ?? {
      key: participant.key,
      samples: [],
      renderPosition: new THREE.Vector3(),
      renderQuaternion: new THREE.Quaternion(),
      renderEyePosition: new THREE.Vector3(),
      renderViewQuaternion: new THREE.Quaternion(),
      color: new THREE.Color(participant.color ?? '#f2c46d')
    };
    record.clientId = participant.clientId;
    record.connectionId = participant.connectionId;
    record.displayId = participant.displayId;
    record.name = participant.name;
    record.cityId = participant.cityId;
    record.cityName = participant.cityName;
    record.mode = participant.mode;
    record.color.set(participant.color ?? '#f2c46d');
    record.lastSeen = receivedAt;
    const sample = record.samples.length >= 4
      ? record.samples.shift()
      : {
          t: 0,
          p: new THREE.Vector3(),
          eye: new THREE.Vector3(),
          q: new THREE.Quaternion(),
          vq: new THREE.Quaternion()
        };
    sample.t = receivedAt;
    this.sanitizePosition(pose.p, sample.p);
    if (pose.hasEye) this.sanitizeEyePosition(pose.eye, sample.eye, sample.p);
    else sample.eye.copy(sample.p);
    sample.q.set(pose.q[0], pose.q[1], pose.q[2], pose.q[3]).normalize();
    sample.vq.set(pose.vq[0], pose.vq[1], pose.vq[2], pose.vq[3]).normalize();
    record.samples.push(sample);
    this.records.set(participant.key, record);
  }

  remove(key) {
    this.records.delete(key);
  }

  clear() {
    this.records.clear();
    this.visibleRecords = [];
    this.bodyMesh.count = 0;
    this.arrowMesh.count = 0;
    this.beaconMesh.count = 0;
    this.hideLabels();
  }

  markDisconnected() {
    for (const record of this.records.values()) record.lastSeen = Math.min(record.lastSeen, performance.now() - STALE_FADE_MS);
  }

  setVisible(visible) {
    this.group.visible = visible;
    this.labelLayer.hidden = !visible;
  }

  update(now, _delta, participants) {
    if (!this.group.visible) {
      this.visibleRecords = [];
      this.hideLabels();
      return;
    }

    const visibleRecords = [];
    let index = 0;
    for (const participant of participants.values()) {
      const record = this.records.get(participant.key);
      if (!record || record.samples.length === 0) continue;
      const lastSeen = Math.max(record.lastSeen || 0, participant.lastMovementAt || 0, participant.lastPresenceAt || 0);
      if (now - lastSeen > STALE_REMOVE_MS || index >= MAX_REMOTE_EXPLORERS) continue;
      this.sampleRecord(record, now);
      const staleAge = Math.max(0, now - lastSeen - STALE_FADE_MS);
      const fadeScale = staleAge > 0 ? Math.max(0.24, 1 - staleAge / (STALE_REMOVE_MS - STALE_FADE_MS)) : 1;
      const scale = this.tmpScale.setScalar(fadeScale);

      this.tmpEuler.setFromQuaternion(record.renderQuaternion, 'YXZ');
      this.tmpQuaternion.setFromEuler(this.tmpEuler.set(0, this.tmpEuler.y, 0));
      this.tmpPosition.copy(record.renderPosition);
      this.bodyMesh.setColorAt(index, record.color);
      this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, scale);
      this.bodyMesh.setMatrixAt(index, this.tmpMatrix);

      this.tmpPosition.copy(record.renderPosition).addScaledVector(getForward(this.tmpQuaternion, this.tmpNextPosition), REMOTE_DIRECTION_MARKER_FORWARD_OFFSET);
      this.tmpPosition.y += REMOTE_DIRECTION_MARKER_Y_OFFSET;
      this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale.setScalar(fadeScale * REMOTE_DIRECTION_MARKER_SCALE));
      this.arrowMesh.setColorAt(index, this.tmpColor.copy(record.color).lerp(this.arrowMixColor, 0.45));
      this.arrowMesh.setMatrixAt(index, this.tmpMatrix);

      this.tmpPosition.copy(record.renderPosition).y -= 11;
      this.tmpMatrix.compose(this.tmpPosition, this.identityQuaternion, this.tmpScale.set(1, fadeScale, 1));
      this.beaconMesh.setMatrixAt(index, this.tmpMatrix);

      visibleRecords.push(record);
      index += 1;
    }

    this.visibleRecords = visibleRecords;
    this.bodyMesh.count = index;
    this.arrowMesh.count = index;
    this.beaconMesh.count = index;
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.arrowMesh.instanceMatrix.needsUpdate = true;
    this.beaconMesh.instanceMatrix.needsUpdate = true;
    this.bodyMesh.computeBoundingSphere();
    this.arrowMesh.computeBoundingSphere();
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
    if (this.arrowMesh.instanceColor) this.arrowMesh.instanceColor.needsUpdate = true;
    this.updateLabels(visibleRecords);
  }

  hasTargetPose(recordKey, now = performance.now()) {
    const record = this.records.get(recordKey);
    if (!record || record.samples.length === 0) return false;
    return now - (record.lastSeen || 0) <= STALE_REMOVE_MS;
  }

  getTargetPose(recordKey, now = performance.now(), participant = null) {
    const record = this.records.get(recordKey);
    if (!record || record.samples.length === 0 || now - (record.lastSeen || 0) > STALE_REMOVE_MS) return null;

    this.sampleRecord(record, now);
    const avatarQuaternion = record.renderQuaternion.clone();
    const viewQuaternion = record.renderViewQuaternion.clone();
    return {
      key: record.key,
      clientId: record.clientId ?? participant?.clientId ?? null,
      connectionId: record.connectionId ?? participant?.connectionId ?? null,
      displayId: record.displayId ?? participant?.displayId ?? null,
      name: record.name ?? participant?.name ?? 'Visitor',
      cityId: record.cityId ?? participant?.cityId ?? null,
      cityName: record.cityName ?? participant?.cityName ?? null,
      mode: record.mode ?? participant?.mode ?? 'orbit',
      position: record.renderEyePosition.clone(),
      eyePosition: record.renderEyePosition.clone(),
      bodyPosition: record.renderPosition.clone(),
      quaternion: viewQuaternion,
      avatarQuaternion,
      forward: getForward(viewQuaternion, new THREE.Vector3()),
      viewForward: getForward(viewQuaternion, new THREE.Vector3()),
      avatarForward: getForward(avatarQuaternion, new THREE.Vector3()),
      lastSeen: record.lastSeen || 0,
      stale: now - (record.lastSeen || 0) > STALE_FADE_MS
    };
  }

  pickVisitorAt(clientX, clientY, domElement, now = performance.now()) {
    if (!this.group.visible || !domElement || this.visibleRecords.length === 0) return null;
    const rect = domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    this.pickPointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pickPointer, this.camera);
    const hits = this.raycaster.intersectObjects([this.bodyMesh, this.arrowMesh], false);
    for (const hit of hits) {
      if (!Number.isInteger(hit.instanceId)) continue;
      const record = this.visibleRecords[hit.instanceId];
      const pose = record ? this.getTargetPose(record.key, now) : null;
      if (pose) return pose;
    }
    return null;
  }

  sampleRecord(record, now) {
    const samples = record.samples;
    const delay = this.isMobilePointer ? INTERPOLATION_DELAY_MOBILE_MS : INTERPOLATION_DELAY_DESKTOP_MS;
    const targetTime = now - delay;
    if (samples.length === 1 || targetTime <= samples[0].t) {
      record.renderPosition.copy(samples[0].p);
      record.renderEyePosition.copy(samples[0].eye);
      record.renderQuaternion.copy(samples[0].q);
      record.renderViewQuaternion.copy(samples[0].vq);
      return;
    }

    let from = samples[0];
    let to = samples[samples.length - 1];
    for (let i = 1; i < samples.length; i += 1) {
      if (samples[i].t >= targetTime) {
        from = samples[i - 1];
        to = samples[i];
        break;
      }
    }

    const span = Math.max(1, to.t - from.t);
    const alpha = Math.max(0, Math.min(1, (targetTime - from.t) / span));
    record.renderPosition.lerpVectors(from.p, to.p, alpha);
    record.renderEyePosition.lerpVectors(from.eye, to.eye, alpha);
    record.renderQuaternion.slerpQuaternions(from.q, to.q, alpha);
    record.renderViewQuaternion.slerpQuaternions(from.vq, to.vq, alpha);
  }

  sanitizePosition(position, target) {
    const bounds = this.world.bounds;
    const x = Math.max(bounds.minX, Math.min(bounds.maxX, position[0]));
    const z = Math.max(bounds.minZ, Math.min(bounds.maxZ, position[2]));
    const groundY = this.world.heightAt(x, z);
    const y = Math.max(groundY + 6, Math.min(660, position[1]));
    return target.set(x, y, z);
  }

  sanitizeEyePosition(position, target, bodyPosition) {
    const bounds = this.world.bounds;
    const x = Math.max(bounds.minX, Math.min(bounds.maxX, position[0]));
    const z = Math.max(bounds.minZ, Math.min(bounds.maxZ, position[2]));
    const y = Math.max(bodyPosition.y + REMOTE_EYE_OFFSET, Math.min(660, position[1]));
    return target.set(x, y, z);
  }

  updateLabels(records) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const nearest = records
      .map((record) => ({ record, distance: this.camera.position.distanceTo(record.renderPosition) }))
      .filter((item) => item.distance < (this.isMobilePointer ? 460 : 820))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, this.isMobilePointer ? 3 : MAX_REMOTE_LABELS);

    this.hideLabels();
    nearest.forEach(({ record }, index) => {
      const label = this.labels[index];
      this.projected.copy(record.renderPosition).add(this.labelOffset).project(this.camera);
      const screenX = (this.projected.x * 0.5 + 0.5) * width;
      const screenY = (-this.projected.y * 0.5 + 0.5) * height;
      if (this.projected.z >= 1 || screenX < 24 || screenX > width - 24 || screenY < 24 || screenY > height - 24) return;
      label.hidden = false;
      label.textContent = `${record.name ?? 'Visitor'} · ${record.mode === 'flight' ? 'Flying' : 'Exploring'} ${record.cityName ?? 'nearby'}`;
      label.style.left = `${screenX}px`;
      label.style.top = `${screenY}px`;
    });
  }

  hideLabels() {
    this.labels.forEach((label) => {
      label.hidden = true;
    });
  }

  dispose() {
    this.labelLayer.remove();
    this.group.removeFromParent();
    this.bodyMesh.geometry.dispose();
    this.arrowMesh.geometry.dispose();
    this.beaconMesh.geometry.dispose();
    this.bodyMesh.material.dispose();
    this.arrowMesh.material.dispose();
    this.beaconMesh.material.dispose();
  }
}

function getForward(quaternion, target) {
  return target.set(0, 0, -1).applyQuaternion(quaternion).normalize();
}

function actorKey(message) {
  return `${message.clientId ?? 'unknown'}:${message.connectionId ?? 'unknown'}`;
}

function normalizePresenceData(data, clientId) {
  if (!data || data.v !== 1 || !data.pose) return null;
  const movement = normalizePose(data.pose);
  if (!movement) return null;
  const displayId = displayIdFromClientId(clientId) || sanitizeDisplayId(data.displayId);
  const userName = sanitizeUserName(data.userName);
  return {
    seq: Number.isFinite(data.seq) ? data.seq : 0,
    displayId,
    name: formatVisitorName(userName, displayId, data.name),
    color: sanitizeColor(data.color),
    cityId: cleanCity(data.cityId),
    cityName: typeof data.cityName === 'string' ? data.cityName.slice(0, 32) : formatCityName(data.cityId),
    mode: data.mode === 'flight' ? 'flight' : 'orbit',
    pose: movement
  };
}

function normalizeMovementData(data, clientId) {
  if (!data || data.v !== 1 || !Array.isArray(data.p) || !Array.isArray(data.q)) return null;
  const pose = normalizePose(data);
  if (!pose) return null;
  const displayId = displayIdFromClientId(clientId) || sanitizeDisplayId(data.displayId);
  const userName = sanitizeUserName(data.userName);
  return {
    cid: typeof data.cid === 'string' ? data.cid : null,
    seq: Number.isFinite(data.seq) ? data.seq : 0,
    displayId,
    name: formatVisitorName(userName, displayId, data.name),
    color: sanitizeColor(data.color),
    cityId: cleanCity(data.cityId),
    cityName: typeof data.cityName === 'string' ? data.cityName.slice(0, 32) : formatCityName(data.cityId),
    mode: data.mode === 'flight' ? 'flight' : 'orbit',
    pose,
    speed: Number.isFinite(data.speed) ? data.speed : 0,
    moving: Boolean(data.moving)
  };
}

function formatVisitorName(userName, displayId, fallbackName = '') {
  const safeName = sanitizeUserName(userName);
  const safeId = sanitizeDisplayId(displayId);
  if (safeName && safeId) return `${safeName} #${safeId}`;
  if (safeName) return safeName;
  if (safeId) return `Visitor #${safeId}`;
  const fallback = sanitizeFallbackName(fallbackName);
  return fallback || 'Visitor';
}

function preferredVisitorName(existing, incoming) {
  const displayId = incoming.displayId ?? existing?.displayId;
  if (incoming.name && !isFallbackVisitorName(incoming.name, displayId)) return incoming.name;
  if (existing?.name && !isFallbackVisitorName(existing.name, displayId)) return existing.name;
  return incoming.name ?? existing?.name ?? (displayId ? `Visitor #${displayId}` : 'Visitor');
}

function isFallbackVisitorName(name, displayId) {
  if (typeof name !== 'string' || !name.trim()) return true;
  const safeId = sanitizeDisplayId(displayId);
  const trimmed = name.trim();
  return trimmed === 'Visitor' || (safeId ? trimmed === `Visitor #${safeId}` : false);
}

function sanitizeUserName(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>]/g, '')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim()
    .slice(0, USER_NAME_MAX_LENGTH);
}

function sanitizeFallbackName(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>]/g, '')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim()
    .slice(0, 40);
}

function sanitizeDisplayId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '').slice(0, 5);
  return digits.length === 5 ? digits : null;
}

function displayIdFromClientId(clientId) {
  if (typeof clientId !== 'string' || !clientId) return null;
  return String(hashString(clientId) % 100000).padStart(5, '0');
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sanitizeColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#f2c46d';
}

function normalizePose(data) {
  const p = data.p;
  const q = data.q;
  const eye = data.eye;
  const vq = data.vq;
  const hasEye = isFiniteTuple(eye, 3);
  const hasViewQuaternion = isFiniteTuple(vq, 4);
  if (!isFiniteTuple(p, 3)) return null;
  if (!isFiniteTuple(q, 4)) return null;
  return {
    p,
    eye: hasEye ? eye : p,
    q,
    vq: hasViewQuaternion ? vq : q,
    hasEye,
    hasViewQuaternion
  };
}

function isFiniteTuple(value, length) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

function cleanCity(cityId) {
  return String(cityId || 'between').replace(/[^a-zA-Z0-9_-]/g, '-');
}

function formatCityName(cityId) {
  if (!cityId || cityId === 'between') return 'across the atlas';
  return cityId
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
