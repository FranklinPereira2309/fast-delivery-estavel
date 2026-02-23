class AudioAlertService {
    private audio: HTMLAudioElement;
    private initialized = false;

    constructor() {
        // Usando o mesmo som que existia no useDigitalAlert
        this.audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

        const unlockAudio = () => {
            if (this.initialized) return;
            // Toca um áudio silencioso para desbloquear o motor de áudio do navegador
            this.audio.volume = 0;
            this.audio.play().then(() => {
                this.audio.pause();
                this.audio.currentTime = 0;
                this.audio.volume = 1;
                this.initialized = true;
                document.removeEventListener('click', unlockAudio);
                document.removeEventListener('keydown', unlockAudio);
                document.removeEventListener('touchstart', unlockAudio);
            }).catch(err => {
                console.log('Audio unlock blocked waiting for full interaction.', err);
            });
        };

        document.addEventListener('click', unlockAudio);
        document.addEventListener('keydown', unlockAudio);
        document.addEventListener('touchstart', unlockAudio);
    }

    public play() {
        if (this.initialized) {
            this.audio.currentTime = 0;
            this.audio.play().catch(console.error);
        } else {
            // Fallback caso ainda não tenha sido inicializado, a maioria dos navegadores modernos bloqueará
            this.audio.play().catch(console.error);
        }
    }
}

export const audioAlert = new AudioAlertService();
