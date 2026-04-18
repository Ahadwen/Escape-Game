import { mountEscape } from "./game.js";

mountEscape({
  canvas: document.getElementById("game"),
  snapshotFolderButton: document.getElementById("snapshot-folder-button"),
  snapshotStatus: document.getElementById("snapshot-status"),
  controlsHintEl: document.getElementById("game-controls-hint"),
  characterSelectModal: document.getElementById("character-select-modal"),
  characterSelectOptions: Array.from(document.querySelectorAll("[data-character-id]")),
  abilitySlots: Array.from(document.querySelectorAll(".ability-slot")),
  deckRankSlotEls: Array.from({ length: 13 }, (_, i) => document.getElementById(`deck-slot-${i + 1}`)),
  backpackSlotEls: Array.from({ length: 3 }, (_, i) => document.getElementById(`backpack-slot-${i + 1}`)),
  setBonusStatusEl: document.getElementById("set-bonus-status"),
  dangerRampFillEl: document.getElementById("danger-ramp-fill"),
  cardModal: document.getElementById("card-modal"),
  modalDeckStripEl: document.getElementById("modal-deck-strip"),
  cardModalFace: document.getElementById("card-modal-face"),
  modalSetBonusStatusEl: document.getElementById("modal-set-bonus-status"),
  cardCloseButton: document.getElementById("card-close-button"),
  cardPickupButton: document.getElementById("card-pickup-button"),
  cardSkipButton: document.getElementById("card-skip-button"),
  cardSwapRow: document.getElementById("card-swap-row"),
});
