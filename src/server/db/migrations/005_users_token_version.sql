-- 005 : révocation de session. Le JWT porte `tv` ; le logout incrémente `token_version`, ce qui invalide les jetons émis avant.
ALTER TABLE users ADD COLUMN token_version integer NOT NULL DEFAULT 0;
