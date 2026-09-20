import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Attaches a short-lived signed URL to each document so it can be viewed
 * from a private Storage bucket. Uses the caller's own Supabase client, so
 * this only succeeds for documents the caller's RLS/storage policies
 * already let them read — it grants no access beyond that.
 */
export async function withSignedUrls<T extends { storage_path: string }>(
  supabase: SupabaseClient,
  documents: T[],
  expiresInSeconds = 60 * 60
): Promise<(T & { url: string | null })[]> {
  return Promise.all(
    documents.map(async (doc) => {
      const { data } = await supabase.storage
        .from("client-documents")
        .createSignedUrl(doc.storage_path, expiresInSeconds);
      return { ...doc, url: data?.signedUrl ?? null };
    })
  );
}
