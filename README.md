# Bloomloop (private play)

A password-protected copy of Bloomloop, for private use. The playable page is at:

**[Play Bloomloop](https://nim901.github.io/bloomloop-play/)**

This repository holds only an encrypted bundle. It does not contain the password or the readable game source.

Every push runs the Playwright WebKit/Chromium regression suite, including the three-minute bounded-object soak, before Pages deployment. Configure the repository Actions secret `BLOOMLOOP_PASSWORD`; the workflow decrypts only into its temporary QA server and never deploys the decrypted game.
