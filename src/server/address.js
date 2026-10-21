// Une adresse e-mail SIMPLE : pas d'espace, de chevron, de virgule, de point-virgule, de guillemet ni de parenthèse (injection d'en-têtes / listes).
const SINGLE_ADDRESS = /^[^\s<>,;"()[\]\\@]+@[^\s<>,;"()[\]\\@]+\.[^\s<>,;"()[\]\\@]+$/;
export const isSingleAddress = (s) => typeof s === 'string' && s.length <= 254 && SINGLE_ADDRESS.test(s);

/**
 * Expéditeur : `adresse` ou `Nom <adresse>`. Le nom d'affichage ne contient ni caractère de contrôle, ni `, ; < > " \ @` (Nodemailer
 * lirait « A, B <x@y> » comme deux expéditeurs) ; l'adresse est simple. Longueur bornée.
 */
export function isSingleSender(s) {
  if (typeof s !== 'string' || s.length > 300) return false;
  if (isSingleAddress(s)) return true;
  const m = /^([^<>]+?) <([^<>]+)>$/.exec(s);
  if (!m) return false;
  const [, name, address] = m;
  return isSingleAddress(address) && !/[\p{Cc}\p{Zl}\p{Zp},;<>"\\@]/u.test(name) && name.trim() === name && name.length > 0;
}
