import { IStorageComponent } from "../../../src/types";

export function createS3ComponentMock(): IStorageComponent {
    return {
        storeFile: jest.fn(),
        exists: jest.fn()
    }
}
