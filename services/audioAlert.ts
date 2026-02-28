class AudioAlertService {
    private audio: HTMLAudioElement;
    private initialized = false;

    constructor() {
        // Usando o mesmo som que existia no useDigitalAlert
        this.audio = new Audio('/alerta.mp3');

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
        // Tenta tocar o áudio. Se o navegador bloquear (falta de interação), falha silenciosamente com log informativo.
        this.audio.play().catch(err => {
            if (err.name === 'NotAllowedError') {
                console.log('🔔 Alerta sonoro pendente: clique na página para habilitar o som.');
            } else {
                console.error('Erro ao reproduzir áudio:', err);
            }
        });
    }
}

export const audioAlert = new AudioAlertService();
