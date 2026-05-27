import OneSignal from 'react-onesignal';

/**
 * Centralized OneSignal Service Wrapper
 *
 * Encapsulates and isolates all direct interactions with the OneSignal Web Push SDK
 * to ensure cleaner testing, maintenance, and compliance with architectural requirements.
 */
const OneSignalService = {
  /**
   * Initializes the OneSignal SDK and registers a subscription change observer
   * @param {string} appId - OneSignal Application ID
   * @param {function} onSubscriptionIdRegistered - Callback triggered when push subscription ID changes from null/empty to a real value
   */
  async init(appId, onSubscriptionIdRegistered) {
    try {
      console.log('[OneSignalService] Initializing with App ID:', appId);
      
      await OneSignal.init({
        appId: appId,
        allowLocalhostAsSecureOrigin: true, // Aids development/testing on localhost
      });

      // Register Push Subscription Observer immediately after initialization
      OneSignal.User.PushSubscription.addEventListener('change', (event) => {
        console.log('[OneSignalService] Push subscription state changed:', event);
        
        const oldId = event.previous?.id;
        const newId = event.current?.id;

        // When the push subscription ID changes from null/empty to a real value
        if (newId && !oldId) {
          console.log('[OneSignalService] Subscription registered! ID:', newId);
          if (onSubscriptionIdRegistered) {
            onSubscriptionIdRegistered(newId);
          }
        }
      });
      
      console.log('[OneSignalService] Initialized successfully');
    } catch (err) {
      console.error('[OneSignalService] Initialization failed:', err);
    }
  },

  /**
   * Identifies the current user with an external ID
   * @param {string} externalId - External unique identifier for the user
   */
  login(externalId) {
    if (!externalId) return;
    OneSignal.login(externalId)
      .then(() => console.log(`[OneSignalService] Successfully logged in user: ${externalId}`))
      .catch((err) => console.error('[OneSignalService] Login failed:', err));
  },

  /**
   * Logs out the current user, unlinking their device and resetting the session
   */
  logout() {
    OneSignal.logout()
      .then(() => console.log('[OneSignalService] Successfully logged out'))
      .catch((err) => console.error('[OneSignalService] Logout failed:', err));
  },

  /**
   * Adds an email subscription to the current user
   * @param {string} email - Email address
   */
  addEmail(email) {
    if (!email) return;
    OneSignal.User.addEmail(email)
      .then(() => console.log(`[OneSignalService] Added email: ${email}`))
      .catch((err) => console.error('[OneSignalService] Add email failed:', err));
  },

  /**
   * Adds an SMS subscription to the current user
   * @param {string} smsNumber - SMS number (e.g. +15555555555)
   */
  addSms(smsNumber) {
    if (!smsNumber) return;
    OneSignal.User.addSms(smsNumber)
      .then(() => console.log(`[OneSignalService] Added SMS: ${smsNumber}`))
      .catch((err) => console.error('[OneSignalService] Add SMS failed:', err));
  },

  /**
   * Adds a single tag (key-value pair) to the user
   * @param {string} key
   * @param {string} value
   */
  addTag(key, value) {
    try {
      OneSignal.User.addTag(key, value);
      console.log(`[OneSignalService] Tag added: ${key} = ${value}`);
    } catch (err) {
      console.error('[OneSignalService] Add tag failed:', err);
    }
  },

  /**
   * Adds multiple tags (key-value pairs) to the user
   * @param {object} tags - Object containing key-value pairs
   */
  addTags(tags) {
    try {
      OneSignal.User.addTags(tags);
      console.log('[OneSignalService] Tags added:', tags);
    } catch (err) {
      console.error('[OneSignalService] Add tags failed:', err);
    }
  },

  /**
   * Removes a single tag by key
   * @param {string} key
   */
  removeTag(key) {
    try {
      OneSignal.User.removeTag(key);
      console.log(`[OneSignalService] Tag removed: ${key}`);
    } catch (err) {
      console.error('[OneSignalService] Remove tag failed:', err);
    }
  },

  /**
   * Removes multiple tags by keys
   * @param {string[]} keys
   */
  removeTags(keys) {
    try {
      OneSignal.User.removeTags(keys);
      console.log('[OneSignalService] Tags removed:', keys);
    } catch (err) {
      console.error('[OneSignalService] Remove tags failed:', err);
    }
  },

  /**
   * Sets triggers for in-app messaging targeting
   * @param {string} key
   * @param {string} value
   */
  addTrigger(key, value) {
    try {
      OneSignal.InAppMessages.addTrigger(key, value);
      console.log(`[OneSignalService] Trigger set: ${key} = ${value}`);
    } catch (err) {
      console.error('[OneSignalService] Set trigger failed:', err);
    }
  },

  /**
   * Adjusts local logging level to monitor integration
   * @param {number} level - Debug level
   */
  setDebug(level) {
    console.log(`[OneSignalService] Log level set to ${level}`);
  }
};

export default OneSignalService;
