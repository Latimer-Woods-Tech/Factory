/**
 * Example: Using BirthTimeInput in a Chart Creation Form
 *
 * This example demonstrates how to integrate BirthTimeInput with other form fields
 * (birth date, location) and submit the complete birth chart data.
 */

import React, { useState } from 'react';
import { BirthTimeInput } from './BirthTimeInput';
import { parseToUTC } from '../lib/dateFormatting';
import styles from './BirthTimeInput.module.css';

interface ChartFormData {
  birthDate: string; // YYYY-MM-DD
  birthTime: string; // HH:MM (24-hour ISO)
  birthLocation: string;
  chartType: 'astrology' | 'human-design' | 'gene-keys';
}

interface ChartFormErrors {
  birthDate?: string;
  birthTime?: string;
  birthLocation?: string;
}

/**
 * Example component: Chart creation form with birth time input
 *
 * @example
 * ```tsx
 * <ChartCreationForm onSubmit={(data) => console.log(data)} />
 * ```
 */
export function ChartCreationForm({
  onSubmit,
}: {
  onSubmit: (data: ChartFormData) => Promise<void>;
}): JSX.Element {
  const [formData, setFormData] = useState<ChartFormData>({
    birthDate: '',
    birthTime: '09:00',
    birthLocation: '',
    chartType: 'astrology',
  });

  const [errors, setErrors] = useState<ChartFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Validate form data
  const validateForm = (): boolean => {
    const newErrors: ChartFormErrors = {};

    if (!formData.birthDate) {
      newErrors.birthDate = 'Birth date is required';
    } else {
      // Guard against non-string or malformed birthDate values before they reach
      // the backend's parseToUTC call (prevents "birthDate.split is not a function").
      // Validate date and time separately so errors are attributed to the correct field.
      try {
        parseToUTC(formData.birthDate);
      } catch {
        newErrors.birthDate = 'Birth date is invalid — please use the date picker';
      }
    }

    if (!formData.birthTime) {
      newErrors.birthTime = 'Birth time is required';
    } else if (!newErrors.birthDate) {
      // Only validate time if date is already valid (parseToUTC needs both).
      try {
        parseToUTC(formData.birthDate, formData.birthTime);
      } catch {
        newErrors.birthTime = 'Birth time is invalid — please re-select using the dropdowns';
      }
    }

    if (!formData.birthLocation.trim()) {
      newErrors.birthLocation = 'Birth location is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitSuccess(false);

    try {
      await onSubmit(formData);
      setSubmitSuccess(true);

      // Reset form
      setFormData({
        birthDate: '',
        birthTime: '09:00',
        birthLocation: '',
        chartType: 'astrology',
      });
      setErrors({});
    } catch (error) {
      console.error('Form submission failed:', error);
      setErrors({
        birthDate: error instanceof Error ? error.message : 'Submission failed',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="chart-creation-form" noValidate>
      <h2>Create Your Chart</h2>

      {/* Success message */}
      {submitSuccess && (
        <div className="form-success" role="status">
          ✓ Chart created successfully! Your reading will be ready soon.
        </div>
      )}

      {/* Chart type selector */}
      <div className="form-group">
        <label htmlFor="chartType">Chart Type</label>
        <select
          id="chartType"
          value={formData.chartType}
          onChange={(e) =>
            setFormData({
              ...formData,
              chartType: e.target.value as typeof formData.chartType,
            })
          }
        >
          <option value="astrology">Astrology</option>
          <option value="human-design">Human Design</option>
          <option value="gene-keys">Gene Keys</option>
        </select>
      </div>

      {/* Birth date input */}
      <div className="form-group">
        <label htmlFor="birthDate">
          Birth Date <span aria-label="required">*</span>
        </label>
        <input
          id="birthDate"
          type="date"
          value={formData.birthDate}
          onChange={(e) =>
            setFormData({ ...formData, birthDate: e.target.value })
          }
          aria-invalid={!!errors.birthDate}
          aria-describedby={errors.birthDate ? 'birthDate-error' : undefined}
          required
        />
        {errors.birthDate && (
          <p id="birthDate-error" className="form-error">
            {errors.birthDate}
          </p>
        )}
      </div>

      {/* Birth time input — the main component */}
      <div className="form-group">
        <label>
          Birth Time (12-hour format){' '}
          <span aria-label="required">*</span>
        </label>
        <BirthTimeInput
          value={formData.birthTime}
          onChange={(newTime) =>
            setFormData({ ...formData, birthTime: newTime })
          }
          error={errors.birthTime}
          className={`${styles['birth-time-input']} form-control`}
        />
        <small className="form-help">
          Select your birth time in 12-hour AM/PM format (e.g., 3:45 PM).
          If you don't know the exact time,{' '}
          <a href="#time-rectification">learn about time rectification</a>.
        </small>
      </div>

      {/* Birth location input */}
      <div className="form-group">
        <label htmlFor="birthLocation">
          Birth Location <span aria-label="required">*</span>
        </label>
        <input
          id="birthLocation"
          type="text"
          placeholder="City, Country"
          value={formData.birthLocation}
          onChange={(e) =>
            setFormData({ ...formData, birthLocation: e.target.value })
          }
          aria-invalid={!!errors.birthLocation}
          aria-describedby={
            errors.birthLocation ? 'birthLocation-error' : undefined
          }
          required
        />
        {errors.birthLocation && (
          <p id="birthLocation-error" className="form-error">
            {errors.birthLocation}
          </p>
        )}
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="form-submit-btn"
      >
        {isSubmitting ? 'Creating chart...' : 'Create My Chart'}
      </button>

      {/* Legal note */}
      <p className="form-note">
        By creating a chart, you agree to our{' '}
        <a href="/terms">Terms of Service</a> and{' '}
        <a href="/privacy">Privacy Policy</a>.
      </p>
    </form>
  );
}

/* ====================================================================
   Example usage in a page/component wrapper
   ==================================================================== */

/**
 * Example page wrapper showing how to use ChartCreationForm
 */
export function ChartCreationPage(): JSX.Element {
  const handleFormSubmit = async (data: ChartFormData): Promise<void> => {
    // Send data to backend
    const response = await fetch('/api/charts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create chart: ${response.statusText}`);
    }

    // Response contains the newly created chart with ID
    const newChart = await response.json();
    console.log('Chart created:', newChart.id);

    // Optional: redirect to chart view
    // window.location.href = `/charts/${newChart.id}`;
  };

  return (
    <div className="page-wrapper">
      <header>
        <h1>Energy Blueprint Generator</h1>
        <p>Discover your pattern. Lead with it.</p>
      </header>

      <main>
        <ChartCreationForm onSubmit={handleFormSubmit} />
      </main>
    </div>
  );
}

export default ChartCreationPage;
