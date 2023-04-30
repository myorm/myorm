import { playlistsCtx } from '$lib/server/database/contexts.js';

export async function GET({ request, params }) {
    return new Response(JSON.stringify({
    }));
}