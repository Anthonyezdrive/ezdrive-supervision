import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "@/i18n/fr.json";
import en from "@/i18n/en.json";

const storedLang = localStorage.getItem("ezdrive-lang");
const browserLang = navigator.language.startsWith("fr") ? "fr" : "en";

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: storedLang || browserLang,
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  localStorage.setItem("ezdrive-lang", lng);
  document.documentElement.lang = lng;
});

export default i18n;
