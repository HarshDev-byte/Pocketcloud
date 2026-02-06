class CryptoIntegrityError extends Error {
  constructor(message = "File integrity verification failed") {
    super(message);
    this.name = "CryptoIntegrityError";
  }
}

module.exports = { CryptoIntegrityError };
