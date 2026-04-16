import { mountEscape } from "./game.js";

mountEscape({
  canvas: document.getElementById("game"),
  snapshotFolderButton: document.getElementById("snapshot-folder-button"),
  snapshotStatus: document.getElementById("snapshot-status"),
});
