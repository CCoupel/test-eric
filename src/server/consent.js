// Texte de consentement RGPD affiché sur la fiche publique. Versionné : toute modification du texte
// DOIT changer CONSENT_TEXT_VERSION (la version acceptée est stockée avec chaque inscription).
export function consentText(config) {
  return [
    "J'accepte que le club enregistre les informations saisies (nom du participant, nom et adresse e-mail du contact) pour organiser cette activité et m'envoyer les communications du club qui la concernent.",
    "Si le participant est mineur, je confirme être son parent ou son représentant légal, et je consens en son nom à ce traitement ; l'adresse e-mail enregistrée est la mienne.",
    `Ces données sont conservées jusqu'à ${config.retentionMonths} mois après la date de l'activité, puis supprimées. Je peux à tout moment consulter mon inscription et la supprimer, avec mes données, grâce au lien de gestion fourni à l'inscription.`,
  ].join('\n');
}
