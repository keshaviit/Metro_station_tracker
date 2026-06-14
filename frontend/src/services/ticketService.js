import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

/**
 * Redirects the user to the official Delhi Metro (DMRC) WhatsApp ticketing chatbot.
 * Chatbot Number: +91 96508 55800
 */
export const buyOfficialMetroTicket = async () => {
  const url = 'https://wa.me/919650855800?text=Hi';
  try {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url });
    } else {
      window.open(url, '_blank');
    }
  } catch (err) {
    console.error('Failed to open WhatsApp ticketing chatbot:', err);
    // Fallback to standard window.open in case the plugin throws
    window.open(url, '_blank');
  }
};
