import { computed, ref } from "vue";
import classicCss from "../themes/classic.css?inline";
import endfieldCss from "../themes/endfield.css?inline";

type Appearance = "classic" | "endfield";
const storageKey = "seatsheet-appearance";
const styles = { classic: classicCss, endfield: endfieldCss };
const current = ref<Appearance>("classic");
const stylesheet = document.createElement("style");

function apply(value: Appearance) {
  stylesheet.textContent = styles[value];
  current.value = value;
}

function readPreference(): Appearance {
  try {
    return localStorage.getItem(storageKey) === "endfield" ? "endfield" : "classic";
  } catch {
    return "classic";
  }
}

export const isEndfield = computed(() => current.value === "endfield");
export const appearance = computed({
  get: () => current.value,
  set(value: Appearance) {
    apply(value);
    try {
      localStorage.setItem(storageKey, value);
    } catch { /* Keep the selection for this tab when storage is unavailable. */ }
  }
});

export function initializeAppearance() {
  apply(readPreference());
  document.head.append(stylesheet);
  window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) apply(readPreference());
  });
}
