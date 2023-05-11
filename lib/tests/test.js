//@ts-check

import { MyORMContext } from "../src/contexts.js";
import { testDeletes } from "./deletes.js";
import { testInserts } from "./inserts.js";
import { testSelects } from "./queries.js";
import { testUpdates } from "./updates.js";
import { adapter, createMySql2Pool } from '../../../adapters/mysql/lib/src/adapter.js';
// import { adapter, createMySql2Pool } from '../../../adapters/mysql-adapter/lib/src/adapter.js';

import { config } from 'dotenv';

config();
const dbCfg = { 
    database: process.env.DB_DB, 
    host: process.env.DB_HOST, 
    user: process.env.DB_USER, 
    password: process.env.DB_PASS, 
    port: parseInt(process.env.DB_PORT ?? "3306") 
};

// const pool = MyORMContext.createPool({ host: "192.168.1.9", port: 10500, database: "chinook", user: "root", password: "root" });
const pool = createMySql2Pool(dbCfg);
const chinookAdapter = adapter(pool);

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").Track>} */
export const trackCtx = new MyORMContext(chinookAdapter, "Track");

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").Customer>} */
export const customerCtx = new MyORMContext(chinookAdapter, "Customer");

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").Playlist>} */
export const playlistsCtx = new MyORMContext(chinookAdapter, "Playlist");

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").TestTable>} */
export const testTableCtx = new MyORMContext(chinookAdapter, "TestTable", { allowTruncation: true });

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").TestTable & { Id?: number }>} */
export const testTableIdentCtx = new MyORMContext(chinookAdapter, "TestTableIdentity", { allowTruncation: true });


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
function onSuccess({ cmdRaw, cmdSanitized }) {
    if(printSuccesses) {
        console.log(cmdRaw);
    }
}

/** @type {import("../src/contexts.js").FailHandler} */
function onFail({ cmdRaw, cmdSanitized }) {
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
        .where(m => m.Name.equals("Music")
            .and(m => m.PlaylistId.not().equals(1)))
        .select();
    process.exit();
}