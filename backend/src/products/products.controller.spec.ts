import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

describe('ProductsController', () => {
  it('delegates the product catalog query', async () => {
    const products = [{ id: 'product-id', stock: 100 }];
    const getAll = jest.fn().mockResolvedValue(products);
    const controller = new ProductsController({
      getAll,
    } as unknown as ProductsService);

    await expect(controller.getAll()).resolves.toEqual(products);
    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it('delegates the featured product query', async () => {
    const getFeatured = jest.fn().mockResolvedValue({
      id: 'product-id',
      stock: 2,
    });
    const controller = new ProductsController({
      getFeatured,
    } as unknown as ProductsService);

    await expect(controller.getFeatured()).resolves.toEqual({
      id: 'product-id',
      stock: 2,
    });
    expect(getFeatured).toHaveBeenCalledTimes(1);
  });
});
