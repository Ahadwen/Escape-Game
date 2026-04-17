import { mountEscape } from "./game.js";

mountEscape({
  canvas: document.getElementById("game"),
  snapshotFolderButton: document.getElementById("snapshot-folder-button"),
  snapshotStatus: document.getElementById("snapshot-status"),
  characterSelectModal: document.getElementById("character-select-modal"),
  characterSelectOptions: Array.from(document.querySelectorAll("[data-character-id]")),
  abilitySlots: Array.from(document.querySelectorAll(".ability-slot")),
  cardSlotEls: Array.from(document.querySelectorAll("#card-slots .card-slot")),
  backpackSlotEl: document.getElementById("backpack-slot"),
  setBonusStatusEl: document.getElementById("set-bonus-status"),
  cardModal: document.getElementById("card-modal"),
  cardModalFace: document.getElementById("card-modal-face"),
  modalSetBonusStatusEl: document.getElementById("modal-set-bonus-status"),
  cardCloseButton: document.getElementById("card-close-button"),
  cardPickupButton: document.getElementById("card-pickup-button"),
  cardSkipButton: document.getElementById("card-skip-button"),
  cardSwapRow: document.getElementById("card-swap-row"),
});
