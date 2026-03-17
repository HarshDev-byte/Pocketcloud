import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ActivityService, ActionType } from '../services/activity.service';

interface ActivityContext {
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  details?: object;
}

type ContextExtractor = (req: Request, res?: Response) => ActivityContext;

/**
 * Creates middleware that logs activity after successful API responses
 */
export function createActivityLogger(
  action: ActionType,
  getContext?: ContextExtractor
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original end method
    const originalEnd = res.end;
    
    // Override end method to capture response
    res.end = function(chunk?: any, encoding?: any): Response {
      // Only log on successful responses (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const context = getContext ? getContext(req, res) : {};
          
          ActivityService.log({
            userId: req.user?.id,
            action,
            resourceType: context.resourceType,
            resourceId: context.resourceId,
            resourceName: context.resourceName,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            details: context.details
          });
        } catch (error) {
          // Never let activity logging break the response
        }
      }
      
      // Call original end method
      return originalEnd.call(this, chunk, encoding) as Response;
    };
    
    next();
  };
}

/**
 * Logs authentication failures (called manually in auth routes)
 */
export function logAuthFailure(req: Request, username?: string): void {
  ActivityService.log({
    action: 'auth.fail',
    resourceType: 'user',
    resourceName: username,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    details: {
      username,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Logs successful authentication
 */
export function logAuthSuccess(req: Request, userId: string, username: string): void {
  ActivityService.log({
    userId,
    action: 'auth.login',
    resourceType: 'user',
    resourceId: userId,
    resourceName: username,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    details: {
      loginTime: new Date().toISOString()
    }
  });
}

/**
 * Logs logout
 */
export function logLogout(req: Request, userId: string, username: string): void {
  ActivityService.log({
    userId,
    action: 'auth.logout',
    resourceType: 'user',
    resourceId: userId,
    resourceName: username,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    details: {
      logoutTime: new Date().toISOString()
    }
  });
}

/**
 * Logs share access by anonymous users
 */
export function logShareAccess(req: Request, shareToken: string, resourceName?: string): void {
  ActivityService.log({
    action: 'share.access',
    resourceType: 'share',
    resourceId: shareToken,
    resourceName,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    details: {
      shareToken,
      accessTime: new Date().toISOString(),
      isAnonymous: !req.user
    }
  });
}