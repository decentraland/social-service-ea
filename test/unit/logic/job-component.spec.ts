import { ILoggerComponent } from '@well-known-components/interfaces'
import { IJobComponent, createJobComponent } from '../../../src/logic/job'
import { createLogsMockedComponent } from '../../mocks/components'

let logs: ILoggerComponent
let component: IJobComponent
let job: jest.Mock
let time: number
let componentFinished: Promise<void>
let onFinish: () => void
const mockedSetTimeout = jest.spyOn(global, 'setTimeout')

beforeEach(() => {
  job = jest.fn()
  logs = createLogsMockedComponent()
  time = 1000
  let finish
  componentFinished = new Promise((resolve) => (finish = resolve))
  onFinish = () => finish()
  mockedSetTimeout.mockReset()
  mockedSetTimeout.mockImplementation((handler) => {
    ;(handler as any)()
    return 1 as any
  })
})

describe('when starting a job', () => {
  describe('and the option to repeat the job is is set as false', () => {
    beforeEach(() => {
      component = createJobComponent({ logs }, job, time, { repeat: false, onFinish })
    })

    it('should run the job once and finish', async () => {
      component.start()
      await componentFinished
      expect(job).toHaveBeenCalledTimes(1)
    })
  })

  describe('and the start up time option is set', () => {
    beforeEach(() => {
      component = createJobComponent({ logs }, job, time, { startupDelay: 4000, repeat: false, onFinish })
    })

    it('should wait the defined time before running the job for the first time', async () => {
      component.start()
      await componentFinished
      expect(mockedSetTimeout).toHaveBeenCalledWith(expect.anything(), 4000)
      expect(job).toHaveBeenCalled()
    })
  })

  describe('and the start up time option is not set', () => {
    beforeEach(() => {
      component = createJobComponent({ logs }, job, time, { repeat: false, onFinish })
    })

    it('should not wait before running the job for the first time', async () => {
      component.start()
      await componentFinished
      expect(mockedSetTimeout).toHaveBeenCalledWith(expect.anything(), 0)
      expect(job).toHaveBeenCalled()
    })
  })

  describe('and the option to repeat the job is is set as true', () => {
    beforeEach(() => {
      component = createJobComponent({ logs }, job, time, { repeat: true, onFinish })
      job.mockResolvedValueOnce(undefined).mockImplementationOnce(() => {
        component.stop()
      })
    })

    it('should repeat until the job on the given time until cancelled', async () => {
      component.start()
      await componentFinished
      expect(mockedSetTimeout).toHaveBeenCalledWith(expect.anything(), 1000)
      expect(job).toHaveBeenCalledTimes(2)
    })
  })

  describe("and there's an error when executing the job", () => {
    let onError: jest.Mock
    let error: Error

    beforeEach(() => {
      onError = jest.fn()
      error = new Error('An error occurred')
      job.mockRejectedValueOnce(error)
      component = createJobComponent({ logs }, job, time, { repeat: false, onError, onFinish })
    })

    it('should execute the given onError method', async () => {
      component.start()
      await componentFinished
      expect(onError).toHaveBeenCalledWith(error)
    })
  })
})

describe('when stopping a started job', () => {
  let finishJobExecution: (value: unknown) => void
  let jobExecutingPromise: Promise<void>

  beforeEach(() => {
    let signalExecution
    component = createJobComponent({ logs }, job, time, { onFinish })
    jobExecutingPromise = new Promise((resolve) => (signalExecution = resolve))
    job
      .mockImplementationOnce(() => {
        signalExecution()
        return new Promise((resolve) => {
          finishJobExecution = resolve
        })
      })
      .mockRejectedValueOnce("It shouldn't execute the job twice")
  })

  it('should wait until the job has completed and not run any more jobs', async () => {
    component.start()
    await jobExecutingPromise
    const promiseOfStoppingTheJob = component.stop()
    finishJobExecution(undefined)
    await Promise.all([promiseOfStoppingTheJob, componentFinished])
    expect(job).toHaveBeenCalledTimes(1)
  })
})
