<?php

use App\Http\Controllers\Api\V1\AIController;
use App\Http\Controllers\Api\V1\HealthController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::get('/health', [HealthController::class, 'show']);
    Route::post('/ai/edit', [AIController::class, 'edit']);
    Route::post('/ai/image-to-diagram', [AIController::class, 'imageToDiagram']);
});
