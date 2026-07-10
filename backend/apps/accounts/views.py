# ─────────────────────────────────────────────────────────────────────────────
# Password Reset Views (UPDATED with Custom Token Model)
# ─────────────────────────────────────────────────────────────────────────────


@extend_schema(
    request=PasswordResetRequestSerializer,
    responses=OpenApiResponse(description="Reset email sent if account exists."),
)
class PasswordResetRequestView(APIView):
    """
    POST /api/auth/password-reset/

    Accept an email address and send a password reset link if the account exists.
    Always returns the same response to prevent email enumeration attacks.
    Rate-limited to 3 requests/hour per IP.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetThrottle, StrictIdentityPasswordResetThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"].lower()
        user = User.objects.filter(email__iexact=email).first()

        if user:
            # Invalidate any existing unused tokens for this user
            PasswordResetToken.objects.filter(user=user, is_used=False).update(
                is_used=True
            )
            reset_token = PasswordResetToken.objects.create(user=user)

            # Build reset link
            reset_url = frontend_url(
                "/reset-password", {"token": str(reset_token.token)}
            )
            timeout = getattr(settings, "PASSWORD_RESET_TIMEOUT_MINUTES", 15)

            # Send email asynchronously with HTML template
            async_task(
                "apps.accounts.tasks.send_password_reset_email_task",
                user_email=user.email,
                user_username=user.username,
                reset_url=reset_url,
                timeout=timeout,
            )

        # Always return the same response to prevent email enumeration
        return Response(
            {
                "message": "If an account with that email exists, a password reset link has been sent."
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(
    request=PasswordResetConfirmSerializer,
    responses=OpenApiResponse(description="Password successfully reset."),
)
class PasswordResetConfirmView(APIView):
    """
    POST /api/auth/password-reset/confirm/

    Accept a reset token and new password to complete the password reset.
    Tokens are single-use and expire after PASSWORD_RESET_TIMEOUT_MINUTES.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token_value = serializer.validated_data["token"]
        new_password = serializer.validated_data["new_password"]

        try:
            reset_token = PasswordResetToken.objects.select_related("user").get(
                token=token_value,
                is_used=False,
            )
        except PasswordResetToken.DoesNotExist:
            return Response(
                {
                    "error": "invalid_token",
                    "message": "This reset link is invalid or has already been used.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if reset_token.is_expired():
            return Response(
                {
                    "error": "expired_token",
                    "message": "This reset link has expired. Please request a new one.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = reset_token.user
        user.set_password(new_password)
        if hasattr(user, "profile"):
            user.profile.last_password_change = timezone.now()
            user.profile.save(update_fields=["last_password_change"])
        user.save()

        reset_token.is_used = True
        reset_token.save(update_fields=["is_used"])

        return Response(
            {
                "message": "Your password has been successfully reset. You can now log in."
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(
    responses=OpenApiResponse(description="Check if reset token is valid."),
)
class PasswordResetValidateTokenView(APIView):
    """
    GET /api/auth/password-reset/validate-token/?token=xxx

    Check if a reset token is valid and not expired.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        token_value = request.query_params.get('token')

        if not token_value:
            return Response(
                {'valid': False, 'error': 'Token is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            reset_token = PasswordResetToken.objects.get(
                token=token_value,
                is_used=False,
            )
        except PasswordResetToken.DoesNotExist:
            return Response({
                'valid': False,
                'error': 'Invalid or already used token'
            })

        if reset_token.is_expired():
            return Response({
                'valid': False,
                'error': 'Token has expired'
            })

        return Response({
            'valid': True,
            'message': 'Token is valid',
            'email': reset_token.user.email
        })