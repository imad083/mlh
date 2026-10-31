<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;

final class HealthController extends Controller
{
    public function show(): JsonResponse
    {
        return ApiResponse::success([
            'service' => 'CanvasMind API',
            'status' => 'ok',
        ]);
    }
}
