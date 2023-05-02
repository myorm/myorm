//@ts-check

import { MyORMContext } from "../src/contexts.js";
import { testDeletes } from "./deletes.js";
import { testInserts } from "./inserts.js";
import { testSelects } from "./queries.js";
import { testUpdates } from "./updates.js";

// const pool = MyORMContext.createPool({ host: "192.168.1.9", port: 10500, database: "chinook", user: "root", password: "root" });
const pool = MyORMContext.createPool({ host: "localhost", database: "chinook", user: "root", password: "root" });

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").Track>} */
export const trackCtx = new MyORMContext(pool, "Track");

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").Customer>} */
export const customerCtx = new MyORMContext(pool, "Customer");

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").Playlist>} */
export const playlistsCtx = new MyORMContext(pool, "Playlist");

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").TestTable>} */
export const testTableCtx = new MyORMContext(pool, "TestTable", { allowTruncation: true });

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").TestTable & { Id?: number }>} */
export const testTableIdentCtx = new MyORMContext(pool, "TestTableIdentity", { allowTruncation: true });


trackCtx.hasOne(m => m.Album
    .withKeys("AlbumId", "AlbumId")
        .andThatHasOne(m => m.Artist.withKeys("ArtistId", "ArtistId")))
    .hasOne(m => m.Genre.withKeys("GenreId", "GenreId"))
    .hasOne(m => m.MediaType.withKeys("MediaTypeId", "MediaTypeId"))
    .hasOne(m => m.PlaylistTrack.withKeys("TrackId", "TrackId")
        .andThatHasOne(m => m.Playlist.withKeys("PlaylistId", "PlaylistId")));

playlistsCtx
    .hasMany(m => m.PlaylistTracks.fromTable("PlaylistTrack").withKeys("PlaylistId", "PlaylistId")
        .andThatHasOne(m => m.Track.withKeys("TrackId", "TrackId")
            .andThatHasOne(m => m.Album.withKeys("AlbumId", "AlbumId")
                .andThatHasOne(m => m.Artist.withKeys("ArtistId", "ArtistId")))
            .andThatHasOne(m => m.Genre.withKeys("GenreId", "GenreId"))
            .andThatHasOne(m => m.MediaType.withKeys("MediaTypeId", "MediaTypeId"))));

trackCtx.onSuccess(onSuccess);
trackCtx.onFail(onFail);
customerCtx.onSuccess(onSuccess);
customerCtx.onFail(onFail);
playlistsCtx.onSuccess(onSuccess);
playlistsCtx.onFail(onFail);

testTableCtx.onSuccess(onSuccess);
testTableCtx.onFail(onFail);
testTableIdentCtx.onSuccess(onSuccess);
testTableIdentCtx.onFail(onFail);

const printSuccesses = true;
const printFails = true;

console.log(process.argv.length);
if (process.argv.length > 2) {
    if (process.argv.includes("--custom") || process.argv.includes("-c")) {
        doCustom();
    } else {
        doTests();
    }
} else {
    doTests();
}


/** @type {import("../src/contexts.js").SuccessHandler} */
function onSuccess({ schema, host, cmdRaw, cmdSanitized }) {
    if(printSuccesses) {
        console.log(cmdRaw);
    }
}

/** @type {import("../src/contexts.js").FailHandler} */
function onFail({ schema, host, cmdRaw, cmdSanitized }) {
    if (printFails) {
        console.log("Command failed: ", cmdRaw);
    }
}

async function doTests() {
    await testTableCtx.truncate();
    await testTableIdentCtx.truncate();
    await testSelects();
    await testInserts();
    await testUpdates();
    await testDeletes();
    process.exit();
}

async function doCustom() {
    const playlists = await playlistsCtx
        .include(m => m.PlaylistTracks
            .thenInclude(m => m.Track
                .thenInclude(m => m.Album
                    .thenInclude(m => m.Artist))
                .thenInclude(m => m.Genre)
                .thenInclude(m => m.MediaType)))
        .where(m => m.Name.eq("Music"))
        .take(1)
        .count();
    console.log(JSON.stringify(playlists, undefined, 4));
    process.exit();
}