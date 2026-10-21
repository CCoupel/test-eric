// Rendu des e-mails : texte brut du client → HTML SÛR. Aucun HTML client conservé, aucune autolinkification.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

export const normalizeNewlines = (s) => String(s).replace(/\r\n?/g, '\n');

/** Texte → HTML : échappement PUIS paragraphes (`\n\n`) et sauts de ligne (`<br>`). */
export function textToHtml(text) {
  return normalizeNewlines(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

const SUBJECT_FORBIDDEN = /[\p{Cc}\p{Zl}\p{Zp}]/u; // CR, LF, NUL, tabulations, séparateurs de ligne : refusés (injection d'en-têtes)
export const isSafeSubject = (s) => !SUBJECT_FORBIDDEN.test(s);

/** Pied de page commun des messages groupés (toutes URLs issues de config.baseUrl / token généré, jamais du client). */
export function bulkMessage({ config, subject, body, activityTitles, unsubscribeUrl, unsubscribePageUrl }) {
  const titles = activityTitles.map((t) => String(t).slice(0, 120));
  const contact = config.contactEmail;
  const privacy = `${config.baseUrl}/confidentialite`;
  const footerText = [
    '--',
    `Vous recevez ce message car vous êtes inscrit(e) à : ${titles.join(', ')}.`,
    `Se désinscrire (supprime l’inscription et vos données) : ${unsubscribePageUrl}`,
    `Confidentialité : ${privacy}`,
    ...(contact ? [`Contact : ${contact}`] : []),
  ].join('\n');
  const footerHtml =
    `<hr><p style="color:#555;font-size:12px">Vous recevez ce message car vous êtes inscrit(e) à : ${escapeHtml(titles.join(', '))}.<br>` +
    `<a href="${escapeHtml(unsubscribePageUrl)}">Se désinscrire</a> (supprime l’inscription et vos données) · ` +
    `<a href="${escapeHtml(privacy)}">Confidentialité</a>` +
    (contact ? ` · Contact : ${escapeHtml(contact)}` : '') +
    '</p>';
  const headers = {
    'List-Unsubscribe': `<${unsubscribeUrl}>${contact ? `, <mailto:${contact}?subject=unsubscribe>` : ''}`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
  return {
    subject,
    text: `${normalizeNewlines(body)}\n\n${footerText}\n`,
    html: `${textToHtml(body)}\n${footerHtml}\n`,
    headers,
  };
}

/** E-mail de confirmation d'inscription : contenu minimal, nom du participant tronqué et échappé (un tiers peut saisir l'adresse d'une victime). */
export function confirmationMessage({ config, activityTitle, participantName, manageUrl }) {
  const who = String(participantName).slice(0, 60);
  const title = String(activityTitle).slice(0, 120);
  return {
    subject: `Inscription enregistrée : ${title}`.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' '),
    text:
      `Une inscription à « ${title} » a été enregistrée pour ${who} avec cette adresse e-mail.\n\n` +
      `Pour consulter ou supprimer l’inscription (et les données associées) : ${manageUrl}\n\n` +
      `Si vous n’êtes pas à l’origine de cette demande, ouvrez le lien ci-dessus et supprimez l’inscription, ou ignorez ce message.\n` +
      `${config.contactEmail ? `Contact : ${config.contactEmail}\n` : ''}`,
    html:
      `<p>Une inscription à « ${escapeHtml(title)} » a été enregistrée pour ${escapeHtml(who)} avec cette adresse e-mail.</p>` +
      `<p><a href="${escapeHtml(manageUrl)}">Consulter ou supprimer l’inscription</a> (et les données associées).</p>` +
      `<p>Si vous n’êtes pas à l’origine de cette demande, supprimez l’inscription via ce lien ou ignorez ce message.` +
      `${config.contactEmail ? `<br>Contact : ${escapeHtml(config.contactEmail)}` : ''}</p>`,
    headers: {},
  };
}
