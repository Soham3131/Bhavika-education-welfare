"use client";

import React from "react";
import Link from "next/link";
import { BHAVIKA_REGISTER_URL } from "@/lib/constants";
import { HeartHandshake, ArrowRight, ExternalLink, GraduationCap, Users } from "lucide-react";

interface BhavikaNgoBannerProps {
  customRegisterUrl?: string;
  className?: string;
}

export function BhavikaNgoBanner({
  customRegisterUrl,
  className = "",
}: BhavikaNgoBannerProps) {
  const registerUrl =
    customRegisterUrl ||
    process.env.NEXT_PUBLIC_BHAVIKA_REGISTER_URL ||
    BHAVIKA_REGISTER_URL;

  const isExternal =
    registerUrl.startsWith("http://") || registerUrl.startsWith("https://");

  return (
    <section
      aria-label="Bhavika Education & Welfare Foundation Registration"
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#FDFBF7] via-[#F7EFE4] to-[#EFE2CE] border border-[#E4D1B0] p-6 sm:p-8 lg:p-10 shadow-xs transition-all ${className}`}
    >
      {/* Decorative subtle background accents */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 rounded-full bg-[#C5A059]/10 blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 -mb-8 w-36 h-36 rounded-full bg-[#6B0B1A]/5 blur-xl pointer-events-none" />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
        {/* Left Column: NGO Badge, Headline, Supporting Text, and Transparency Note */}
        <div className="lg:col-span-8 space-y-4">
          {/* Trust Tag */}
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/80 border border-[#E0CEAC] shadow-2xs text-[11px] font-semibold text-[#6B0B1A]">
            <HeartHandshake className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
            <span>Community Empowerment & NGO Partner</span>
          </div>

          {/* Headline */}
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#6B0B1A] leading-tight tracking-tight">
            Join the Bhavika Education & Welfare Foundation
          </h2>

          {/* Supporting Text */}
          <p className="text-gray-700 text-sm sm:text-base leading-relaxed font-normal max-w-2xl">
            Register with our foundation and become part of our community initiatives.
            Empowering rural children, families, and grassroots communities through daily learning, educational quizzes, and welfare outreach.
          </p>

          {/* Transparency / Account Separation Note */}
          <div className="flex items-start space-x-2 text-xs text-gray-500 pt-1">
            <span className="text-[#C5A059] font-bold shrink-0">ℹ</span>
            <span>
              Registration with the foundation is held directly on the Bhavika Education & Welfare Foundation platform and is separate from your Jai Maa Durga store account.
            </span>
          </div>

          {/* Call to Action Button */}
          <div className="pt-2 flex flex-wrap items-center gap-3">
            {isExternal ? (
              <a
                href={registerUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="bhavika-register-cta"
                className="inline-flex items-center space-x-2.5 bg-[#6B0B1A] hover:bg-[#831023] text-white font-semibold px-6 py-3 rounded-lg shadow-sm transition transform active:scale-98 text-sm focus:outline-hidden focus:ring-2 focus:ring-[#C5A059] focus:ring-offset-2"
              >
                <span>Register with Bhavika</span>
                <ExternalLink className="w-4 h-4 text-amber-200" />
              </a>
            ) : (
              <Link
                href={registerUrl}
                data-testid="bhavika-register-cta"
                className="inline-flex items-center space-x-2.5 bg-[#6B0B1A] hover:bg-[#831023] text-white font-semibold px-6 py-3 rounded-lg shadow-sm transition transform active:scale-98 text-sm focus:outline-hidden focus:ring-2 focus:ring-[#C5A059] focus:ring-offset-2"
              >
                <span>Register with Bhavika</span>
                <ArrowRight className="w-4 h-4 text-amber-200" />
              </Link>
            )}

            <div className="text-xs text-gray-500 font-medium">
              Free to register • Pan India Initiatives
            </div>
          </div>
        </div>

        {/* Right Column: Foundation Impact Cards (Visible on desktop & tablet) */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-3 text-center">
          <div className="p-4 rounded-xl bg-white/85 border border-[#EBDCB9] shadow-2xs space-y-1">
            <div className="w-8 h-8 rounded-full bg-[#6B0B1A]/10 text-[#6B0B1A] flex items-center justify-center mx-auto mb-1">
              <GraduationCap className="w-4 h-4 text-[#C5A059]" />
            </div>
            <div className="text-xs font-bold text-gray-900">Student Quizzes</div>
            <div className="text-[11px] text-gray-500">Daily learning & rewards</div>
          </div>

          <div className="p-4 rounded-xl bg-white/85 border border-[#EBDCB9] shadow-2xs space-y-1">
            <div className="w-8 h-8 rounded-full bg-[#6B0B1A]/10 text-[#6B0B1A] flex items-center justify-center mx-auto mb-1">
              <Users className="w-4 h-4 text-[#C5A059]" />
            </div>
            <div className="text-xs font-bold text-gray-900">Community Support</div>
            <div className="text-[11px] text-gray-500">Grassroots welfare network</div>
          </div>
        </div>
      </div>
    </section>
  );
}

