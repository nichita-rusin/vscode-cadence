import { BehaviorSubject, Observable, Observer, Subscription, firstValueFrom, map, skip } from 'rxjs'

enum ValidationState {
  Valid = 0,
  Fetching = 1,
  FetchingAndQueued = 2
}

/**
 * @template T
 * @class StateCache
 * @description
 * A class that caches a value and fetches it asynchronously.  Comparable to SWR in React.
 * It provides the following guarantees:
 * - The value is always up to date
 * - The value is only fetched once per invalidation
 */
export class StateCache<T> {
  #validationState: ValidationState = ValidationState.Valid
  #value: BehaviorSubject<[T | null, Error | null] | undefined> = new BehaviorSubject<[T | null, Error | null] | undefined>(undefined)
  #fetcher: () => Promise<T>

  // Observable to subscribe to in order to skip initial undefined value and clean up errors
  #observable: Observable<T> = (this.#value as BehaviorSubject<[T | null, Error | null]>).pipe(skip(1), map(([value, error]) => {
    if (error !== null) {
      throw error
    } else {
      return value as T
    }
  }))

  constructor (fetcher: () => Promise<T>) {
    this.#fetcher = fetcher
    this.invalidate()
  }

  async getValue (): Promise<T> {
    let value: T | null, error: Error | null
    if (this.#validationState === ValidationState.Valid) {
      [value, error] = (this.#value as BehaviorSubject<[T | null, Error | null]>).getValue()
    } else {
      const queueNumber = this.#validationState - 1
      ;[value, error] = await (firstValueFrom((this.#value as BehaviorSubject<[T, Error]>).pipe(skip(queueNumber + 1))))
    }

    if (error !== null) {
      throw error
    } else {
      return value as T
    }
  }

  async #fetch (): Promise<void> {
    let value: T | undefined
    try {
      value = await this.#fetcher()
      this.#value.next([value, null])
    } catch (e: any) {
      this.#value.next([null, e])
    }

    this.#validationState -= 1
    if (this.#validationState > 0) {
      void this.#fetch()
    }
  }

  invalidate (): void {
    this.#validationState = Math.min(this.#validationState + 1, 2)
    // If we're not already fetching, start fetching
    if (this.#validationState === ValidationState.Fetching) {
      void this.#fetch()
    }
  }

  setFetcher (fetcher: () => Promise<T>): void {
    this.#fetcher = fetcher
    this.invalidate()
  }

  subscribe (observerOrNext?: Partial<Observer<T>> | ((value: T) => void) | undefined): Subscription {
    return this.#observable.subscribe(observerOrNext)
  }
}
