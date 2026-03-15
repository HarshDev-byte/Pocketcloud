/**
 * Simple validation utilities to replace express-validator
 * Temporary solution for Node.js compatibility issues
 */

import { Request, Response, NextFunction } from 'express';

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationResult {
  isEmpty(): boolean;
  array(): ValidationError[];
}

export function body(field: string) {
  return {
    notEmpty() {
      return {
        withMessage(message: string) {
          return (req: Request, res: Response, next: NextFunction) => {
            if (!req.body || !req.body[field] || req.body[field].trim() === '') {
              req.validationErrors = req.validationErrors || [];
              req.validationErrors.push({ field, message, value: req.body?.[field] });
            }
            next();
          };
        }
      };
    },
    isLength(options: { min?: number; max?: number }) {
      return {
        withMessage(message: string) {
          return (req: Request, res: Response, next: NextFunction) => {
            const value = req.body?.[field];
            if (value && (
              (options.min && value.length < options.min) ||
              (options.max && value.length > options.max)
            )) {
              req.validationErrors = req.validationErrors || [];
              req.validationErrors.push({ field, message, value });
            }
            next();
          };
        }
      };
    }
  };
}

export function validationResult(req: Request): ValidationResult {
  const errors = req.validationErrors || [];
  return {
    isEmpty: () => errors.length === 0,
    array: () => errors
  };
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      validationErrors?: ValidationError[];
    }
  }
}