import i18n from "i18next";
import detector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import translationCn from "../assets/json/locales/cn.json";
import tarnslationEn from '../assets/json/locales/en.json';
import tarnslationFr from '../assets/json/locales/fr.json';
import tarnslationRo from "../assets/json/locales/ro.json";

const resources = {
    cn: { translation: translationCn },
    en: { translation: tarnslationEn },
    fr: { translation: tarnslationFr },
    ro: { translation: tarnslationRo }
};

i18n
    .use(detector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: "en",
        keySeparator: false,
        interpolation: {
            escapeValue: false,
        },
    });

export default i18n