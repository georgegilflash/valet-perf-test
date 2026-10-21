import { Router } from 'express';
import { ENDPOINT_CATALOG } from '../../catalog/index.js';
import { loadDataPools } from '../services/data-pools.service.js';

/**
 * Creates catalog and pools router.
 * @param {string} dataDir - Path to data directory.
 */
export function createCatalogRouter(dataDir) {
  const router = Router();

  // GET /api/catalog - Returns catalog definitions and ID pools
  router.get('/catalog', (req, res) => {
    const pools = loadDataPools(dataDir);
    res.json({
      catalog: ENDPOINT_CATALOG,
      pools
    });
  });

  // GET /api/pools - Returns ID pools only
  router.get('/pools', (req, res) => {
    res.json(loadDataPools(dataDir));
  });

  return router;
}
