# Camoufox signed release metadata

The application ships only the Ed25519 publisher public key, the signed HTTPS
release descriptor and capability policy. The browser executable and detached
manifest never ship inside the application; installation is explicit and the
downloaded archive is verified before extraction. Never place a private key,
browser profile or engine payload in this directory, and never exempt installed
engine files from antivirus scanning.
