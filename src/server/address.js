// Une adresse e-mail SIMPLE : pas d'espace, de chevron, de virgule, de point-virgule, de guillemet ni de parenthèse (injection d'en-têtes / listes).
const SINGLE_ADDRESS = /^[^\s<>,;"()[\]\\@]+@[^\s<>,;"()[\]\\@]+\.[^\s<>,;"()[\]\\@]+$/;
export const isSingleAddress = (s) => typeof s === 'string' && s.length <= 254 && SINGLE_ADDRESS.test(s);
