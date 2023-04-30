//@ts-check

import { MyORMContext } from "../src/contexts.js";
import { testDeletes } from "./deletes.js";
import { testInserts } from "./inserts.js";
import { testSelects } from "./queries.js";
import { testUpdates } from "./updates.js";

const pool = MyORMContext.createPool({ host: "192.168.1.9", port: 10500, database: "chinook", user: "root", password: "root" });

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
    .withKeys("AlbumId", "AlbumId"))
    .hasOne(m => m.Artist
        .withKeys("Composer", "Name"))
    .hasOne(m => m.Genre
        .withKeys("GenreId", "GenreId"))
    .hasOne(m => m.MediaType
        .withKeys("MediaTypeId", "MediaTypeId"))
    .hasOne(m => m.PlaylistTrack
        .withKeys("TrackId", "TrackId")
        .andThatHasOne(m => m.Playlist
            .withKeys("PlaylistId", "PlaylistId")));

playlistsCtx.hasMany(m => m.PlaylistTracks
    .fromTable("PlaylistTrack")
    .withKeys("PlaylistId", "PlaylistId")
    .andThatHasOne(m => m.Track
        .withKeys("TrackId", "TrackId")
        .andThatHasOne(m => m.Album
            .withKeys("AlbumId", "AlbumId"))
        .andThatHasOne(m => m.Artist
            .withKeys("Composer", "Name"))
        .andThatHasOne(m => m.Genre
            .withKeys("GenreId", "GenreId"))
        .andThatHasOne(m => m.MediaType
            .withKeys("MediaTypeId", "MediaTypeId"))));

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
    const tracks = await trackCtx
        .where(m => m.Composer.equals("AC/DC")
            .and(m => m.Name.equals("Dog Eat Dog")
                .or(m => m.Name.contains("go")
                    .and(m => m.Name.contains("down")
                        .and(m => m.Bytes.lessThan(2 ** 53))))
                .or(m => m.Name.contains("let")
                    .and(m => m.Name.contains("rock")
                        .and(m => m.Bytes.lessThan(2 ** 53)))))
            .and(m => m.AlbumId.equals(4)))
        .select();
    process.exit();
}

async function test1() {
    const [rec] = await testTableIdentCtx.insert({
        StringCol: "Test"
    });
    console.log({ inserted: rec });
    rec.BoolCol = false;
    let n = await testTableIdentCtx.update(rec);
    console.log({ updated: n });

    n = await testTableIdentCtx.delete(rec);
    console.log({ deleted: n });
}

async function test2() {
    const [rec] = await testTableIdentCtx.insert({
        StringCol: "Test"
    });
    console.log({ inserted: rec });
    rec.BoolCol = false;
    let n = await testTableIdentCtx.where(m => m.Id.equals(rec.Id)).updateSelect({
        BoolCol: false
    });
    console.log({ updated: n });

    n = await testTableIdentCtx.where(m => m.Id.equals(rec.Id)).deleteSelect();
    console.log({ deleted: n });
}