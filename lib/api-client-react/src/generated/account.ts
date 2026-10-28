/**
 * Личный кабинет покупателя (гостевой вход по e-mail + телефону).
 * Ручной модуль-дополнение к orval-генерации: эндпоинты /store/login,
 * /store/account/{id} и /store/account/{id}/orders.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import type { MutationFunction, QueryFunction, QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';

import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';

export interface AccountOrderItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
}

export type AccountOrderStatus = 'new' | 'confirmed' | 'shipped' | 'completed' | 'cancelled';

export interface AccountOrder {
  id: number;
  address: string;
  total: number;
  status: AccountOrderStatus;
  items: AccountOrderItem[];
  createdAt: string;
}

export interface CustomerProfile {
  id: number;
  name: string;
  email: string;
  phone: string;
  ordersCount: number;
  spent: number;
  createdAt: string;
  lastOrderAt?: string | null;
}

export interface StoreLoginBody {
  email: string;
  phone: string;
}

export interface UpdateCustomerProfileBody {
  name: string;
  phone: string;
}

export interface StoreAccountResponse {
  customer: CustomerProfile;
  token?: string;
}

// ---------------------------------------------------------------------------
// Хранилище токена сессии (для Authorization: Bearer)
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'tp-token';

export function saveAuthToken(token?: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
}
export function readAuthToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function clearAuthToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

const authHeaders = (): Record<string, string> => {
  const token = readAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

const getHeaders = (h?: NonNullable<RequestInit['headers']>): Record<string, string | readonly string[]> => {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Symbol.iterator in h) {
    return Object.fromEntries(Array.from(h as Iterable<Iterable<string>>, (entry) => Array.from(entry) as [string, string]));
  }
  const headers: Record<string, string | readonly string[]> = {};
  for (const [name, value] of Object.entries<string | readonly string[] | undefined>(h)) {
    if (value !== undefined) headers[name] = value;
  }
  return headers;
};

// ---------------------------------------------------------------------------
// POST /api/store/login
// ---------------------------------------------------------------------------
export const getStoreLoginUrl = () => `/api/store/login`;

export const storeLogin = async (body: BodyType<StoreLoginBody>, options?: Parameters<typeof customFetch>[1]): Promise<StoreAccountResponse> => {
  return customFetch<StoreAccountResponse>(getStoreLoginUrl(), {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
    body: JSON.stringify(body),
  });
};

export const getStoreLoginMutationKey = () => ['storeLogin'] as const;

export const useStoreLogin = <TError = ErrorType<{ error?: string }>, TContext = unknown>(
  options?: { mutation?: UseMutationOptions<Awaited<ReturnType<typeof storeLogin>>, TError, { data: BodyType<StoreLoginBody> }, TContext>, request?: SecondParameter<typeof customFetch> },
): UseMutationResult<Awaited<ReturnType<typeof storeLogin>>, TError, { data: BodyType<StoreLoginBody> }, TContext> => {
  const mutationKey = getStoreLoginMutationKey();
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<Awaited<ReturnType<typeof storeLogin>>, { data: BodyType<StoreLoginBody> }> = (props) => {
    const { data } = props ?? {};
    return storeLogin(data, requestOptions);
  };

  return useMutation({ mutationFn, ...mutationOptions });
};

// ---------------------------------------------------------------------------
// GET /api/store/account/{customerId}/orders
// ---------------------------------------------------------------------------
export const getStoreAccountOrdersUrl = (customerId: number) => `/api/store/account/${customerId}/orders`;

export const listStoreAccountOrders = async (customerId: number, options?: Parameters<typeof customFetch>[1]): Promise<AccountOrder[]> => {
  return customFetch<AccountOrder[]>(getStoreAccountOrdersUrl(customerId), { ...options, method: 'GET' });
};

export const getListStoreAccountOrdersQueryKey = (customerId?: number) => {
  return [`/api/store/account/${customerId ?? ''}/orders`] as const;
};

export const getListStoreAccountOrdersQueryOptions = <TData = Awaited<ReturnType<typeof listStoreAccountOrders>>, TError = ErrorType<unknown>>(
  customerId: number | undefined,
  options?: { query?: UseQueryOptions<Awaited<ReturnType<typeof listStoreAccountOrders>>, TError, TData>; request?: SecondParameter<typeof customFetch> },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getListStoreAccountOrdersQueryKey(customerId);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof listStoreAccountOrders>>> = ({ signal }) =>
    listStoreAccountOrders(customerId as number, { signal, ...requestOptions });
  return { queryKey, queryFn, enabled: customerId !== undefined && customerId > 0, ...queryOptions } as UseQueryOptions<Awaited<ReturnType<typeof listStoreAccountOrders>>, TError, TData> & { queryKey: QueryKey };
};

export function useListStoreAccountOrders<TData = Awaited<ReturnType<typeof listStoreAccountOrders>>, TError = ErrorType<unknown>>(
  customerId: number | undefined,
  options?: { query?: UseQueryOptions<Awaited<ReturnType<typeof listStoreAccountOrders>>, TError, TData>; request?: SecondParameter<typeof customFetch> },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getListStoreAccountOrdersQueryOptions(customerId, options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return Object.assign(query, { queryKey: queryOptions.queryKey });
}

// ---------------------------------------------------------------------------
// PATCH /api/store/account/{customerId}
// ---------------------------------------------------------------------------
export const getUpdateStoreAccountUrl = (customerId: number) => `/api/store/account/${customerId}`;

export const updateStoreAccount = async (customerId: number, body: BodyType<UpdateCustomerProfileBody>, options?: Parameters<typeof customFetch>[1]): Promise<StoreAccountResponse> => {
  return customFetch<StoreAccountResponse>(getUpdateStoreAccountUrl(customerId), {
    ...options,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getHeaders(options?.headers) },
    body: JSON.stringify(body),
  });
};

export const getUpdateStoreAccountMutationKey = () => ['updateStoreAccount'] as const;

export const useUpdateStoreAccount = <TError = ErrorType<{ error?: string }>, TContext = unknown>(
  options?: { mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateStoreAccount>>, TError, { customerId: number; data: BodyType<UpdateCustomerProfileBody> }, TContext>, request?: SecondParameter<typeof customFetch> },
): UseMutationResult<Awaited<ReturnType<typeof updateStoreAccount>>, TError, { customerId: number; data: BodyType<UpdateCustomerProfileBody> }, TContext> => {
  const mutationKey = getUpdateStoreAccountMutationKey();
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };

  const mutationFn: MutationFunction<Awaited<ReturnType<typeof updateStoreAccount>>, { customerId: number; data: BodyType<UpdateCustomerProfileBody> }> = (props) => {
    const { customerId, data } = props ?? {};
    return updateStoreAccount(customerId, data, requestOptions);
  };

  return useMutation({ mutationFn, ...mutationOptions });
};

// ---------------------------------------------------------------------------
// Авторизация: регистрация, вход по паролю, телефонный код, Google/Apple
// ---------------------------------------------------------------------------
export interface AuthSessionData {
  customer: CustomerProfile;
  token: string;
}

export interface AuthProvidersData {
  googleConfigured: boolean;
  appleConfigured: boolean;
  googleClientId?: string | null;
  appleClientId?: string | null;
}

export interface PhoneCodeSentData {
  sent: boolean;
  devCode?: string | null;
}

const postJson = async <T>(url: string, body?: unknown): Promise<T> =>
  customFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
  });

/** Сохраняет токен из ответа авторизации (чтобы /auth/me работал без cookie). */
const withTokenSave = <T extends { token?: string }>(res: T): T => {
  saveAuthToken(res?.token);
  return res;
};

export const registerAccount = (body: { name: string; email: string; phone: string; password: string }) =>
  postJson<AuthSessionData>('/api/auth/register', body).then(withTokenSave);
export const loginWithPassword = (body: { identifier: string; password: string }) =>
  postJson<AuthSessionData>('/api/auth/login', body).then(withTokenSave);
export const requestPhoneCode = (body: { phone: string }) =>
  postJson<PhoneCodeSentData>('/api/auth/phone/request-code', body);
export const verifyPhoneCode = (body: { phone: string; code: string }) =>
  postJson<AuthSessionData>('/api/auth/phone/verify', body).then(withTokenSave);
export const loginWithGoogle = (idToken: string) => postJson<AuthSessionData>('/api/auth/google', { idToken }).then(withTokenSave);
export const loginWithApple = (idToken: string) => postJson<AuthSessionData>('/api/auth/apple', { idToken }).then(withTokenSave);
export const logoutAccount = () => { clearAuthToken(); return postJson<{ ok: boolean }>('/api/auth/logout'); };

// ---------------------------------------------------------------------------
// Вопросы покупателей: витрина -> админ-панель
// ---------------------------------------------------------------------------
export interface StoreQuestionData {
  id: number;
  customerId?: number | null;
  authorName: string;
  email?: string | null;
  phone?: string | null;
  subject: 'question' | 'feedback' | 'complaint';
  message: string;
  status: 'new' | 'answered' | 'closed';
  answer?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export const createStoreQuestion = async (body: { authorName: string; email: string; phone?: string; subject?: 'question' | 'feedback' | 'complaint'; message: string }): Promise<StoreQuestionData> =>
  customFetch<StoreQuestionData>('/api/store/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
    credentials: 'include',
  });

export const useCreateStoreQuestion = <TError = ErrorType<{ error?: string }>>(
  options?: UseMutationOptions<StoreQuestionData, TError, { authorName: string; email: string; phone?: string; subject?: 'question' | 'feedback' | 'complaint'; message: string }>,
) => useMutation({ mutationFn: createStoreQuestion, ...options });

export const listAdminQuestions = async (status?: string): Promise<StoreQuestionData[]> =>
  customFetch<StoreQuestionData[]>(`/api/admin/questions${status ? `?status=${status}` : ''}`, { method: 'GET' });

export const getListAdminQuestionsQueryKey = (status?: string) => [`/api/admin/questions`, status ?? ''] as const;

export const useListAdminQuestions = <TError = ErrorType<unknown>>(
  status?: string,
  options?: Omit<UseQueryOptions<StoreQuestionData[], TError>, 'queryKey' | 'queryFn'>,
): UseQueryResult<StoreQuestionData[], TError> =>
  useQuery({ queryKey: getListAdminQuestionsQueryKey(status), queryFn: () => listAdminQuestions(status), retry: 1, ...options });

export const updateAdminQuestion = async (id: number, body: { status?: 'new' | 'answered' | 'closed'; answer?: string }): Promise<StoreQuestionData> =>
  customFetch<StoreQuestionData>(`/api/admin/questions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const useUpdateAdminQuestion = <TError = ErrorType<{ error?: string }>>(
  options?: UseMutationOptions<StoreQuestionData, TError, { id: number; data: { status?: 'new' | 'answered' | 'closed'; answer?: string } }>,
) => useMutation({ mutationFn: ({ id, data }) => updateAdminQuestion(id, data), ...options });

export const deleteAdminQuestion = async (id: number): Promise<void> =>
  customFetch<void>(`/api/admin/questions/${id}`, { method: 'DELETE' });

export const useDeleteAdminQuestion = <TError = ErrorType<unknown>>(
  options?: UseMutationOptions<void, TError, number>,
) => useMutation({ mutationFn: deleteAdminQuestion, ...options });

export const getAuthProvidersUrl = () => '/api/auth/providers';

export const getAuthProviders = async (): Promise<AuthProvidersData> =>
  customFetch<AuthProvidersData>(getAuthProvidersUrl(), { method: 'GET' });

export const getAuthMeUrl = () => '/api/auth/me';

export const getAuthMe = async (options?: Parameters<typeof customFetch>[1]): Promise<StoreAccountResponse> =>
  customFetch<StoreAccountResponse>(getAuthMeUrl(), {
    ...options,
    method: 'GET',
    credentials: 'include',
    headers: { ...authHeaders(), ...(getHeaders(options?.headers) as Record<string, string>) },
  });

export const useRegisterAccount = <TError = ErrorType<{ error?: string }>>(
  options?: UseMutationOptions<AuthSessionData, TError, { name: string; email: string; phone: string; password: string }>,
) => useMutation({ mutationFn: registerAccount, ...options });

export const useLoginWithPassword = <TError = ErrorType<{ error?: string }>>(
  options?: UseMutationOptions<AuthSessionData, TError, { identifier: string; password: string }>,
) => useMutation({ mutationFn: loginWithPassword, ...options });

export const useRequestPhoneCode = <TError = ErrorType<{ error?: string }>>(
  options?: UseMutationOptions<PhoneCodeSentData, TError, { phone: string }>,
) => useMutation({ mutationFn: requestPhoneCode, ...options });

export const useVerifyPhoneCode = <TError = ErrorType<{ error?: string }>>(
  options?: UseMutationOptions<AuthSessionData, TError, { phone: string; code: string }>,
) => useMutation({ mutationFn: verifyPhoneCode, ...options });

export const useLoginWithGoogle = <TError = ErrorType<{ error?: string }>>(
  options?: UseMutationOptions<AuthSessionData, TError, string>,
) => useMutation({ mutationFn: loginWithGoogle, ...options });

export const useLoginWithApple = <TError = ErrorType<{ error?: string }>>(
  options?: UseMutationOptions<AuthSessionData, TError, string>,
) => useMutation({ mutationFn: loginWithApple, ...options });

export const useLogoutAccount = <TError = ErrorType<unknown>>(
  options?: UseMutationOptions<{ ok: boolean }, TError, void>,
) => useMutation({ mutationFn: logoutAccount, ...options });

export const getAuthProvidersQueryKey = () => [getAuthProvidersUrl()] as const;

export const useAuthProviders = <TError = ErrorType<unknown>>(
  options?: Omit<UseQueryOptions<AuthProvidersData, TError>, 'queryKey' | 'queryFn'>,
): UseQueryResult<AuthProvidersData, TError> =>
  useQuery({ queryKey: getAuthProvidersQueryKey(), queryFn: getAuthProviders, staleTime: 60_000, retry: 1, ...options });

export const useAuthMe = <TError = ErrorType<{ error?: string }>>(
  enabled: boolean,
  options?: Omit<UseQueryOptions<StoreAccountResponse, TError>, 'queryKey' | 'queryFn'>,
): UseQueryResult<StoreAccountResponse, TError> =>
  useQuery({ queryKey: [getAuthMeUrl()], queryFn: () => getAuthMe(), enabled, retry: false, ...options });
