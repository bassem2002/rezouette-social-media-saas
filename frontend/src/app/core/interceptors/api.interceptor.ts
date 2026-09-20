import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { appConfig } from '@/core/config/app-config';

/// Intercepteur HTTP global — équivalent de l'instance axios du front React :
///  - préfixe les URLs relatives (`/...`) par `appConfig.apiUrl` (baseURL) ;
///  - active `withCredentials` (cookies de session) ;
///  - redirige vers /login sur une réponse 401.
/// Les corps `FormData` (upload multipart) ne reçoivent pas de Content-Type :
/// HttpClient pose alors le bon boundary, comme `Content-Type: undefined` côté axios.
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const request = req.url.startsWith('/')
    ? req.clone({ url: `${appConfig.apiUrl}${req.url}`, withCredentials: true })
    : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        window.location.href = '/login';
      }
      return throwError(() => error);
    }),
  );
};
