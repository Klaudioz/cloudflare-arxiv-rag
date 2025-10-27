/**
 * Input validation middleware
 */

import { ValidationError } from './errors';

export interface ValidationSchema {
  [key: string]: {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'array';
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: RegExp;
  };
}

export class Validator {
  static validate(data: any, schema: ValidationSchema): void {
    for (const [key, rules] of Object.entries(schema)) {
      const value = data[key];

      // Check required
      if (rules.required && (value === undefined || value === null || value === '')) {
        throw new ValidationError(`${key} is required`);
      }

      if (value === undefined || value === null) {
        continue;
      }

      // Check type
      if (rules.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rules.type) {
          throw new ValidationError(`${key} must be of type ${rules.type}`);
        }
      }

      // String validations
      if (typeof value === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
          throw new ValidationError(`${key} must be at least ${rules.minLength} characters`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          throw new ValidationError(`${key} must be at most ${rules.maxLength} characters`);
        }
        if (rules.pattern && !rules.pattern.test(value)) {
          throw new ValidationError(`${key} format is invalid`);
        }
      }

      // Number validations
      if (typeof value === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          throw new ValidationError(`${key} must be at least ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
          throw new ValidationError(`${key} must be at most ${rules.max}`);
        }
      }
    }
  }

  static validateSearchRequest(data: any): void {
    this.validate(data, {
      query: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 1000
      },
      max_results: {
        type: 'number',
        min: 1,
        max: 50
      }
    });
  }

  static validateRAGRequest(data: any): void {
    this.validate(data, {
      query: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 1000
      },
      top_k: {
        type: 'number',
        min: 1,
        max: 10
      }
    });
  }

  static validateWorkflowPayload(data: any): void {
    this.validate(data, {
      date: {
        type: 'string',
        pattern: /^\d{4}-\d{2}-\d{2}$/
      },
      category: {
        type: 'string',
        minLength: 1,
        maxLength: 50
      }
    });
  }
}
