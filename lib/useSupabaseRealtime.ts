import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

type PostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export interface RealtimeTableSpec {
  table: string;
  event?: PostgresEvent;
  filter?: string;
}

export type RealtimeTables = (string | RealtimeTableSpec)[];

/**
 * Subscribes to Supabase realtime changes on one or more tables and fires
 * `onChange` after a short debounce window. Intentionally coarse: callers
 * refetch their own data; they don't inspect the payload.
 */
export function useSupabaseRealtime(
  channelName: string,
  tables: RealtimeTables,
  onChange: () => void,
  options: { debounceMs?: number; enabled?: boolean } = {}
) {
  const { debounceMs = 300, enabled = true } = options;
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;

  // Stabilise the tables array across renders so the subscription effect only
  // re-runs when the meaningful config changes.
  const tablesKey = JSON.stringify(tables);

  useEffect(() => {
    if (!enabled) return;

    const parsed: RealtimeTableSpec[] = tables.map((t) =>
      typeof t === 'string' ? { table: t, event: '*' } : { event: '*', ...t }
    );

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        callbackRef.current();
      }, debounceMs);
    };

    let channel = supabase.channel(channelName);
    parsed.forEach(({ table, event, filter }) => {
      const config: Record<string, any> = { event, schema: 'public', table };
      if (filter) config.filter = filter;
      channel = channel.on('postgres_changes' as any, config, fire);
    });
    channel.subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [channelName, tablesKey, enabled, debounceMs]);
}
