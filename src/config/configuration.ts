export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || 'api/v1',

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret',
    expiration: process.env.JWT_EXPIRATION || '24h',
  },

  apiKey: {
    prefix: process.env.API_KEY_PREFIX || 'frd',
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '60', 10),
  },

  dgii: {
    environment: process.env.DGII_ENVIRONMENT || 'DEV',
    endpoints: {
      DEV: 'https://ecf.dgii.gov.do/testecf',
      CERT: 'https://ecf.dgii.gov.do/certecf',
      PROD: 'https://ecf.dgii.gov.do/ecf',
    },
    fcEndpoints: {
      DEV: 'https://fc.dgii.gov.do/testecf',
      CERT: 'https://fc.dgii.gov.do/certecf',
      PROD: 'https://fc.dgii.gov.do',
    },
  },

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    kmsKeyId: process.env.AWS_KMS_KEY_ID || '',
    s3Bucket: process.env.AWS_S3_BUCKET || '',
  },
});
