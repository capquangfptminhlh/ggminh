const fs = require('fs');
const path = require('path');

class Store {
  constructor(baseDir) {
    this.baseDir = baseDir || path.resolve(__dirname, '../../data');
    this.dbFile = path.join(this.baseDir, 'db.json');
    this.ensureDirs();
    this.data = this.load();
  }

  ensureDirs() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    const profilesDir = path.join(this.baseDir, 'profiles');
    if (!fs.existsSync(profilesDir)) {
      fs.mkdirSync(profilesDir, { recursive: true });
    }
  }

  load() {
    try {
      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[Store] Error loading DB, falling back to default:', err.message);
    }

    const defaultData = {
      settings: {
        chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        apiPort: 50325,
        defaultGroup: 'Default',
        theme: 'dark'
      },
      proxies: [],
      profiles: []
    };
    this.saveData(defaultData);
    return defaultData;
  }

  saveData(dataToSave) {
    const data = dataToSave || this.data;
    const tempFile = `${this.dbFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, this.dbFile);
  }

  // --- Profile CRUD ---
  getProfiles() {
    return this.data.profiles || [];
  }

  getProfile(id) {
    return (this.data.profiles || []).find(p => p.id === id);
  }

  saveProfile(profile) {
    const existingIndex = (this.data.profiles || []).findIndex(p => p.id === profile.id);
    if (existingIndex >= 0) {
      this.data.profiles[existingIndex] = {
        ...this.data.profiles[existingIndex],
        ...profile,
        updatedAt: new Date().toISOString()
      };
    } else {
      if (!profile.id) {
        profile.id = 'pb_' + Math.random().toString(36).substring(2, 9);
      }
      profile.createdAt = new Date().toISOString();
      profile.updatedAt = new Date().toISOString();
      this.data.profiles.push(profile);
    }
    this.saveData();
    return profile;
  }

  deleteProfile(id) {
    const initialLen = this.data.profiles.length;
    this.data.profiles = this.data.profiles.filter(p => p.id !== id);
    if (this.data.profiles.length !== initialLen) {
      this.saveData();
      // Optionally clean up profile data dir
      const profileDataDir = path.join(this.baseDir, 'profiles', id);
      if (fs.existsSync(profileDataDir)) {
        try {
          fs.rmSync(profileDataDir, { recursive: true, force: true });
        } catch (e) {
          console.warn('[Store] Could not delete profile dir:', e.message);
        }
      }
      return true;
    }
    return false;
  }

  // --- Settings ---
  getSettings() {
    return this.data.settings || {};
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.saveData();
    return this.data.settings;
  }
}

module.exports = Store;
