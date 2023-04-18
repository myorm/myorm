import { MyORMContext } from "@myorm/mysql";

const pool = MyORMContext.createPool({ host: "192.168.1.9", port: 10500, database: "chinook", user: "root", password: "root" });
/** @type {MyORMContext<import("../../lib/types/chinook-types").Playlist>} */
export const playlistsCtx = new MyORMContext(pool, "Playlist");

playlistsCtx.onSuccess(({ cmdRaw }) => {
    console.log(cmdRaw);
});
