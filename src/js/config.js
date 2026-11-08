/*
 * Lo que puedes cambiar a mano. Casi todo lo demás se ajusta desde el panel de Ajustes en el TV.
 */
window.GLASS_CONFIG = {
    // Orden inicial de la fila de apps (claves de js/brands.js). Solo se muestran las instaladas.
    // Cuando reorganizas desde el TV, tu orden reemplaza a este.
    defaultOrder: [
        'netflix', 'youtube', 'primevideo', 'disneyplus', 'max', 'appletv',
        'paramountplus', 'spotify', 'applemusic', 'crunchyroll', 'plex', 'twitch'
    ],

    // Minutos de inactividad antes del protector de pantalla (0 = nunca). Editable en Ajustes.
    screensaverMinutes: 5,

    // Packaged 1080p H.264 MP4, WITHOUT audio (upscaled from the owner's 720p clip).
    // HTTPS URLs also work; add their exact media/CDN origins to config.xml first.
    // Images remains the default style; this clip is loaded only on Aerial entry.
    aerial: { urls: ['media/aerial-coast.mp4'], startupMs: 8000, stallMs: 5000 },

    // Títulos populares de TMDB para el Top Shelf. La clave NO va aquí: va en js/config.local.js
    // (ver config.local.example.js), que no se sube a git. El país y el idioma salen del TV;
    // estos valores solo se usan si el TV no los reporta.
    tmdb: {
        region: 'CO',      // país del catálogo (qué hay en cada plataforma)
        language: 'es-CO'  // idioma de títulos y descripciones
    }
};
