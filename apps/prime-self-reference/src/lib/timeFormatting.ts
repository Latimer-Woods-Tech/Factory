/**
 * Time Formatting Utilities
 * 
 * Converts between 12-hour AM/PM display format and 24-hour ISO 8601 storage format.
 * Used by BirthTimeInput component for birth time selection in astrology/numerology charts.
 */

/**
 * Convert 24-hour ISO format to 12-hour display format
 * 
 * @param iso - ISO 8601 24-hour time string (e.g., "15:45", "09:30", "00:15")
 * @returns Tuple of [hours (1-12), minutes (0-59), period ('AM' | 'PM')]
 * 
 * @example
 * formatTo12Hour("15:45") → [3, 45, "PM"]
 * formatTo12Hour("09:30") → [9, 30, "AM"]
 * formatTo12Hour("00:15") → [12, 15, "AM"]  // Midnight
 * formatTo12Hour("12:00") → [12, 0, "PM"]   // Noon
 */
export function formatTo12Hour(iso: string): [number, number, 'AM' | 'PM'] {
  if (typeof iso !== 'string') {
    throw new TypeError(`formatTo12Hour: iso must be a string, got ${typeof iso}`);
  }

  const parts = iso.split(':');
  const hours24 = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  // Midnight (00:xx) → 12:xx AM
  if (hours24 === 0) {
    return [12, minutes, 'AM'];
  }

  // Morning (01:xx - 11:xx) → same AM
  if (hours24 < 12) {
    return [hours24, minutes, 'AM'];
  }

  // Noon (12:xx) → 12:xx PM
  if (hours24 === 12) {
    return [12, minutes, 'PM'];
  }

  // Afternoon/Evening (13:xx - 23:xx) → subtract 12, PM
  return [hours24 - 12, minutes, 'PM'];
}

/**
 * Convert 12-hour AM/PM display format to 24-hour ISO 8601 format
 * 
 * @param hours12 - Hour value 1-12 (not 0-23)
 * @param minutes - Minute value 0-59
 * @param period - 'AM' or 'PM'
 * @returns ISO 8601 24-hour time string (e.g., "15:45", "09:30")
 * 
 * @example
 * convertTo24Hour(3, 45, "PM")    → "15:45"
 * convertTo24Hour(9, 30, "AM")    → "09:30"
 * convertTo24Hour(12, 15, "AM")   → "00:15"  // Midnight
 * convertTo24Hour(12, 0, "PM")    → "12:00"  // Noon
 * 
 * @throws Error if hours12 is not 1-12 or minutes not 0-59
 */
export function convertTo24Hour(
  hours12: number,
  minutes: number,
  period: 'AM' | 'PM'
): string {
  // Validate inputs
  if (hours12 < 1 || hours12 > 12) {
    throw new Error(`Invalid hours: ${hours12}. Must be 1-12.`);
  }
  if (minutes < 0 || minutes > 59) {
    throw new Error(`Invalid minutes: ${minutes}. Must be 0-59.`);
  }
  if (period !== 'AM' && period !== 'PM') {
    throw new Error(`Invalid period: ${period}. Must be AM or PM.`);
  }

  let hours24 = hours12 % 12; // 12 AM → 0, 1 AM → 1, ..., 11 AM → 11

  // Adjust for PM times
  if (period === 'PM' && hours24 !== 0) {
    hours24 += 12; // 1 PM → 13, ..., 11 PM → 23
  }

  // Format with leading zeros (HH:MM)
  const hoursStr = String(hours24).padStart(2, '0');
  const minutesStr = String(minutes).padStart(2, '0');

  return `${hoursStr}:${minutesStr}`;
}

/**
 * Validate if a 24-hour ISO time string is valid
 * 
 * @param iso - ISO 8601 24-hour time string
 * @returns true if valid, false otherwise
 * 
 * @example
 * isValidTime("15:45") → true
 * isValidTime("25:00") → false
 * isValidTime("15:60") → false
 */
export function isValidTime(iso: string): boolean {
  if (typeof iso !== 'string') return false;

  const parts = iso.split(':');
  if (parts.length !== 2) return false;

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}
