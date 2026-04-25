import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

/**
 * usePresence — wraps Supabase Realtime Presence with a stable React API.
 *
 * @param {string|null} channelKey - opaque key. Pass null/undefined to
 *   disable presence (e.g. when the user isn't in an org context).
 * @param {object} info - what to broadcast about the current user.
 *   { name, avatar, viewing, ... } — `viewing` describes what part of the
 *   app the user is on (e.g. 'overview', 'pv', 'gallery'). Whatever you
 *   put here is visible to other clients on the same channel.
 *
 * Returns the array of currently-present users, including self. Each
 * entry is shaped { user_id, name, avatar, viewing, online_at }. Self
 * is identified by user_id === your auth.uid().
 *
 * Channel lifecycle: subscribed on mount, unsubscribed on unmount.
 * Presence is ephemeral — closing the tab automatically removes you.
 */
export function usePresence(channelKey, info) {
  const [present, setPresent] = useState([]);
  const [userId, setUserId] = useState(null);
  const infoRef = useRef(info);
  // Keep the ref in sync without writing during render (lint rule).
  useEffect(() => { infoRef.current = info; });

  // Resolve the auth user id once.
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (alive && user) setUserId(user.id);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Subscribe / unsubscribe based on channel key + user id.
  useEffect(() => {
    if (!channelKey || !userId) return;

    const channel = supabase.channel(channelKey, {
      config: { presence: { key: userId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const users = Object.entries(state).flatMap(([uid, metas]) =>
        metas.map(meta => ({ user_id: uid, ...meta })),
      );
      setPresent(users);
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        const data = infoRef.current || {};
        await channel.track({
          name: data.name || "",
          avatar: data.avatar || null,
          viewing: data.viewing || "overview",
          online_at: new Date().toISOString(),
        });
      }
    });

    return () => {
      try { channel.unsubscribe(); } catch { /* ignore */ }
    };
  }, [channelKey, userId]);

  // Re-track when the info changes (e.g. user navigates from overview to pv).
  // Re-running track on the same channel updates the meta without
  // tearing down the subscription.
  useEffect(() => {
    if (!channelKey || !userId || !info) return;
    const channel = supabase.getChannels().find(c => c.topic === `realtime:${channelKey}`);
    if (!channel) return;
    channel.track({
      name: info.name || "",
      avatar: info.avatar || null,
      viewing: info.viewing || "overview",
      online_at: new Date().toISOString(),
    }).catch(() => {});
  }, [channelKey, userId, info?.viewing, info?.name, info?.avatar]);

  return { present, selfId: userId };
}
