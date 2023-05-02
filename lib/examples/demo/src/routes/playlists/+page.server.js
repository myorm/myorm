import { playlistsCtx } from "$lib/server/database/contexts";


export async function load() {
    await playlistsCtx
        .hasMany(m => m.PlaylistTracks
            .from("PlaylistTrack")
            .withPrimary("PlaylistId")
            .withForeign("PlaylistId")
            .andThatHasOne(m => m.Track
                .withPrimary("TrackId")
                .withForeign("TrackId")
                .andThatHasOne(m => m.Genre
                    .withPrimary("GenreId")
                    .withForeign("GenreId"))));
    return {
        playlists: await playlistsCtx.select()
    }
}