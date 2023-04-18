import { playlistsCtx } from "$lib/database/contexts";

export async function load({ params }) {
    const id = parseInt(params.id);
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
        playlist: (await playlistsCtx.include(m => m.PlaylistTracks.thenInclude(m => m.Track.thenInclude(m => m.Genre))).where(m => m.PlaylistId.equals(id)).select())[0]
    }
}