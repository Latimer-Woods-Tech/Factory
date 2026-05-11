/**
 * Date Formatting Utilities
 *
 * Parses and converts birth date strings (YYYY-MM-DD) and optional birth time
 * strings (HH:MM, 24-hour) into UTC ISO 8601 datetimes for backend storage.
 *
 * Used by ChartCreationForm to pre-validate user input before submission.
 */

/**
 * Parse a birth date string (YYYY-MM-DD) and optional birth time string
 * (HH:MM, 24-hour) into a UTC ISO 8601 datetime string.
 *
 * @param birthDate - Date in YYYY-MM-DD format (e.g., "1990-05-15")
 * @param birthTime - Optional time in HH:MM 24-hour format (e.g., "14:30").
 *   Defaults to midnight UTC (00:00) when omitted.
 * @returns UTC ISO 8601 datetime string (e.g., "1990-05-15T14:30:00.000Z")
 *
 * @throws {TypeError} When `birthDate` is not a string.
 * @throws {TypeError} When `birthTime` is provided but is not a string.
 * @throws {Error} When `birthDate` does not match YYYY-MM-DD format.
 * @throws {Error} When `birthTime` is provided but does not match HH:MM format.
 * @throws {Error} When numeric parts are out of valid range.
 *
 * @example
 * parseToUTC("1990-05-15")           → "1990-05-15T00:00:00.000Z"
 * parseToUTC("1990-05-15", "14:30") → "1990-05-15T14:30:00.000Z"
 * parseToUTC("1990-05-15", "00:00") → "1990-05-15T00:00:00.000Z"
 */
export function parseToUTC(birthDate: string, birthTime?: string): string {
  if (typeof birthDate !== 'string') {
    throw new TypeError(
      `parseToUTC: birthDate must be a string, got ${typeof birthDate}`,
    );
  }

  if (birthDate.trim() === '') {
    throw new Error('parseToUTC: birthDate must not be empty');
  }

  const dateParts = birthDate.split('-');
  if (dateParts.length !== 3) {
    throw new Error(
      `parseToUTC: invalid birthDate format "${birthDate}", expected YYYY-MM-DD`,
    );
  }

  // dateParts.length === 3, so indices 0–2 are defined (! asserts that to TS).
  const year  = parseInt(dateParts[0]!, 10); // YYYY
  const month = parseInt(dateParts[1]!, 10); // MM
  const day   = parseInt(dateParts[2]!, 10); // DD

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error(
      `parseToUTC: non-numeric date parts in "${birthDate}"`,
    );
  }

  if (year < 1 || year > 9999) {
    throw new Error(`parseToUTC: year ${year} is out of range (1–9999)`);
  }

  if (month < 1 || month > 12) {
    throw new Error(`parseToUTC: month ${month} is out of range (1–12) in "${birthDate}"`);
  }

  if (day < 1 || day > 31) {
    throw new Error(`parseToUTC: day ${day} is out of range (1–31) in "${birthDate}"`);
  }

  let hours = 0;
  let minutes = 0;

  if (birthTime !== undefined) {
    if (typeof birthTime !== 'string') {
      throw new TypeError(
        `parseToUTC: birthTime must be a string, got ${typeof birthTime}`,
      );
    }

    const timeParts = birthTime.split(':');
    if (timeParts.length !== 2) {
      throw new Error(
        `parseToUTC: invalid birthTime format "${birthTime}", expected HH:MM`,
      );
    }

    // timeParts.length === 2, so indices 0–1 are defined (! asserts that to TS).
    hours   = parseInt(timeParts[0]!, 10); // HH
    minutes = parseInt(timeParts[1]!, 10); // MM

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      throw new Error(`parseToUTC: non-numeric time parts in "${birthTime}"`);
    }

    if (hours < 0 || hours > 23) {
      throw new Error(`parseToUTC: hours ${hours} is out of range (0–23) in "${birthTime}"`);
    }

    if (minutes < 0 || minutes > 59) {
      throw new Error(
        `parseToUTC: minutes ${minutes} is out of range (0–59) in "${birthTime}"`,
      );
    }
  }

  return new Date(Date.UTC(year, month - 1, day, hours, minutes)).toISOString();
}
