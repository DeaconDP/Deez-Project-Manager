use aes::Aes256;
use cbc::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use sha2::{Digest, Sha256};

type Aes256CbcEnc = cbc::Encryptor<Aes256>;
type Aes256CbcDec = cbc::Decryptor<Aes256>;

pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
    aes_protect(data, true, crate::usage::paths::SETTINGS_SLUG)
}

pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    aes_protect(data, false, crate::usage::paths::SETTINGS_SLUG)
}

fn derive_key(settings_slug: &str) -> [u8; 32] {
    let profile = crate::usage::paths::user_profile()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let material = format!("{profile}:{settings_slug}");
    Sha256::digest(material.as_bytes()).into()
}

fn aes_protect(data: &[u8], encrypt: bool, settings_slug: &str) -> Result<Vec<u8>, String> {
    let key = derive_key(settings_slug);

    if encrypt {
        let mut iv = [0u8; 16];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut iv);
        let cipher = Aes256CbcEnc::new_from_slices(&key, &iv).map_err(|e| e.to_string())?;
        let mut buf = data.to_vec();
        let cipher_bytes = cipher
            .encrypt_padded_mut::<Pkcs7>(&mut buf, data.len())
            .map_err(|e| e.to_string())?;
        let mut result = Vec::with_capacity(16 + cipher_bytes.len());
        result.extend_from_slice(&iv);
        result.extend_from_slice(cipher_bytes);
        Ok(result)
    } else {
        if data.len() <= 16 {
            return Err("ciphertext too short".into());
        }
        let (iv, cipher_bytes) = data.split_at(16);
        let cipher = Aes256CbcDec::new_from_slices(&key, iv).map_err(|e| e.to_string())?;
        let mut buf = cipher_bytes.to_vec();
        let plain = cipher
            .decrypt_padded_mut::<Pkcs7>(&mut buf)
            .map_err(|e| e.to_string())?;
        Ok(plain.to_vec())
    }
}
