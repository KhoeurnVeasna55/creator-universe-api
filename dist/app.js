"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path")); // Add this import
const error_middleware_1 = require("./middlewares/error.middleware");
// Corrected imports
const category_routes_1 = __importDefault(require("./category/routes/category.routes"));
const banner_routes_1 = __importDefault(require("./banner/routes/banner.routes"));
const auth_routes_1 = __importDefault(require("./auth/routes/auth.routes"));
const user_routes_1 = __importDefault(require("./user/routes/user.routes"));
const mobile_products_routes_1 = __importDefault(require("./product/routes/mobile.products.routes"));
const admin_products_routes_1 = __importDefault(require("./product/routes/admin.products.routes"));
const admin_attribute_routes_1 = __importDefault(require("./attribute/routes/admin.attribute.routes"));
const upload_routes_1 = __importDefault(require("./upload/routes/upload.routes"));
const rateLimit_1 = require("./middlewares/rateLimit");
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_config_1 = __importDefault(require("./docs/swagger.config"));
// Load environment variables
dotenv_1.default.config();
// Create Express app
const app = (0, express_1.default)();
app.set('trust proxy', 1);
// ========================
// Database Connection
// ========================
const connectDB = async () => {
    try {
        await mongoose_1.default.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    }
    catch (err) {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    }
};
// ========================
// Middleware
// ========================
// ✅ Enhanced CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, Postman)
        if (!origin)
            return callback(null, true);
        // List of allowed origins
        const allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:8080',
            'http://127.0.0.1:8080',
            'http://localhost:5000',
            'http://127.0.0.1:5000',
            // Add your Flutter web deployment URLs here
            // 'https://your-flutter-app.vercel.app',
        ];
        if (allowedOrigins.includes(origin) || origin.includes('localhost')) {
            return callback(null, true);
        }
        // For development, allow all origins
        if (process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cache-Control',
        'Pragma'
    ],
    preflightContinue: false,
    optionsSuccessStatus: 204
};
app.use((0, cors_1.default)(corsOptions));
// ✅ Handle preflight requests
// app.options('*', cors(corsOptions));
// ✅ Helmet configuration (allow images from your domain)
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "*"], // Allow images from anywhere
            connectSrc: ["'self'", "*"] // Allow API connections
        },
    },
}));
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json({ limit: '10mb' })); // Increase limit for image uploads
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
const swaggerSpec = (0, swagger_jsdoc_1.default)(swagger_config_1.default);
app.use("/api-docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerSpec, {
    swaggerOptions: {
        persistAuthorization: true,
    },
}));
// Root endpoint with CORS info
app.get('/', (req, res) => {
    res.json({
        name: 'Creator Universe API',
        version: '1.0.1-corsfix',
        status: 'OK',
        uptime: process.uptime().toFixed(2) + 's',
        environment: process.env.NODE_ENV || 'development',
        docs: `${req.protocol}://${req.get('host')}/api-docs`,
        cors: 'enabled',
        staticFiles: '/uploads for image serving'
    });
});
// ========================
// Routes
// ========================
app.use('/api', rateLimit_1.apiLimiter);
app.use('/api/auth', auth_routes_1.default);
app.use('/api/users', user_routes_1.default);
app.use("/api/categories", category_routes_1.default);
app.use("/api/banners", banner_routes_1.default);
app.use("/api/mobile/products", mobile_products_routes_1.default);
app.use("/api/admin/products", admin_products_routes_1.default);
app.use("/api/uploads", upload_routes_1.default);
app.use("/api/attributes", admin_attribute_routes_1.default);
console.log("mobileProductsRouter:", mobile_products_routes_1.default);
console.log("adminProductsRouter:", admin_products_routes_1.default);
console.log("attributeRoutes:", admin_attribute_routes_1.default);
// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});
// ✅ Test CORS endpoint
app.get('/api/test-cors', (req, res) => {
    res.json({
        message: 'CORS is working!',
        origin: req.get('Origin'),
        timestamp: new Date().toISOString()
    });
});
// ========================
// Error Handling
// ========================
app.use(error_middleware_1.notFound);
app.use(error_middleware_1.errorHandler);
// ========================
// Server Startup
// ========================
const PORT = process.env.PORT || 5050;
const server = app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    console.log(`API Documentation: http://localhost:${PORT}/api-docs`);
    console.log(`CORS enabled for development origins`);
});
// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err.message);
    server.close(() => process.exit(1));
});
// Database connection
connectDB();
exports.default = app;
