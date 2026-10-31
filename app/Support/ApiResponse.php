<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;

final class ApiResponse
{
    public static function success(mixed $data, string $message = 'Request processed successfully', int $status = 200): JsonResponse
    {
        return response()->json([
            'status' => 'success',
            'data' => $data,
            'message' => $message,
        ], $status);
    }

    public static function error(string $message = 'Unable to process request', int $status = 400): JsonResponse
    {
        return response()->json([
            'status' => 'error',
            'data' => null,
            'message' => $message,
        ], $status);
    }
}
