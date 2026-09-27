// Character.as:721-1095, original appearance colour branches (including brightness coefficients).
import { rgb2hsv, hsv2rgb } from "./Portrait";
export function originalCreationColors(gender: number, age: number, random = Math.random) {
  const Rndm = {random, integer: (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1))};
  const ColorFunctions = {rgb2hsv, hsv2rgb: (h: number, s: number, v: number): any => hsv2rgb(h,s,v)};
  const param1: any = {};
  let race = 0;
  let _loc10_: any, _loc13_: any, _loc14_: any, _loc15_: any, _loc17_: any, _loc18_: any, _loc2_: any, _loc3_: any, _loc5_: any, _loc6_: any, _loc8_: any, beardColor: any, bristleColor: any, eyeSocketsColor: any, eyebrowsColor: any, eyesColor: any, hairColor: any, lipsColor: any, pantsColor: any, shirtColor: any, shoesColor: any, skinColor: any;
  if(param1.skinColor == null)
  {
     _loc6_ = Rndm.random();
     if(param1.race == null)
     {
        race = Rndm.random();
     }
     else
     {
        race = param1.race;
     }
     if(race < 0.3 && _loc6_ < 0.5)
     {
        _loc6_ = 0.5;
     }
     if(race > 0.7 && _loc6_ < 0.3)
     {
        _loc6_ = 0.3;
     }
     if(race > 0.7 && _loc6_ > 0.7)
     {
        _loc6_ = 0.7;
     }
     _loc8_ = 25 - Math.abs(race - 0.5) * 20;
     _loc13_ = 20 + _loc6_ * 15;
     _loc15_ = 90 - _loc6_ * 45;
     if(_loc15_ > 100)
     {
        _loc15_ = 100;
     }
     skinColor = ColorFunctions.hsv2rgb(_loc8_,_loc13_,_loc15_);
     skinColor.bc = 0.9 + Rndm.random() * 0.2;
  }
  else
  {
     skinColor = param1.skinColor;
  }
  if(param1.lipsColor != null)
  {
     lipsColor = param1.lipsColor;
  }
  else
  {
     _loc14_ = ColorFunctions.rgb2hsv(skinColor.r,skinColor.g,skinColor.b);
     _loc8_ = _loc14_.h;
     _loc13_ = _loc14_.s;
     _loc15_ = _loc14_.v;
     if(gender == 1)
     {
        _loc8_ -= Rndm.integer(1,6);
        _loc13_ += Rndm.integer(1,7);
        _loc15_ -= Rndm.integer(0,3);
        _loc2_ = 0.85 + Rndm.random() * 0.2;
     }
     else
     {
        _loc8_ -= Rndm.integer(5,15);
        _loc13_ += Rndm.integer(5,15);
        _loc15_ -= Rndm.integer(5,15);
        _loc2_ = 0.75 + Rndm.random() * 0.2;
     }
     if(_loc8_ < 0)
     {
        _loc8_ = 0;
     }
     if(_loc13_ > 255)
     {
        _loc13_ = 255;
     }
     if(_loc15_ < 0)
     {
        _loc15_ = 0;
     }
     lipsColor = ColorFunctions.hsv2rgb(_loc8_,_loc13_,_loc15_);
     lipsColor.bc = _loc2_;
  }
  if(param1.hairColor != null)
  {
     hairColor = param1.hairColor;
  }
  else
  {
     if(age > 40 && Rndm.random() < age / 100 - race / 3)
     {
        _loc8_ = 0;
        _loc13_ = 0;
        _loc15_ = 60 + Rndm.random() * 40;
        _loc2_ = 1;
     }
     else if(race < 0.1 || Rndm.random() < 0.5 - race / 2)
     {
        _loc8_ = 10 + Rndm.random() * 10;
        _loc13_ = 50 + Rndm.random() * 30;
        _loc15_ = 5 + Rndm.random() * 20;
        _loc2_ = 0.8 + Rndm.random() * 0.2;
     }
     else if(race > 0.9 || Rndm.random() < race / 4)
     {
        _loc8_ = 30 + Rndm.random() * 10;
        _loc13_ = 15 + Rndm.random() * 7;
        _loc15_ = 80 + Rndm.random() * 10;
        _loc2_ = 1 + Rndm.random() * 0.2;
     }
     else if(Rndm.random() < 0.2 + race / 10)
     {
        _loc8_ = 5 + Rndm.random() * 30;
        _loc13_ = 60 + Rndm.random() * 20;
        _loc15_ = 40 + Rndm.random() * 20;
        _loc2_ = 1;
     }
     else if(Rndm.random() < race / 10 + 0.1)
     {
        _loc8_ = 40 + Rndm.random() * 10;
        _loc13_ = 15 + Rndm.random() * 10;
        _loc15_ = 55 + Rndm.random() * 20;
        _loc2_ = 1 + Rndm.random() * 0.1;
     }
     else
     {
        _loc15_ = 20 + Rndm.random() * 80;
        _loc13_ = 100 - _loc15_;
        _loc8_ = 40 - _loc15_ / 5;
        _loc2_ = 0.8 + Rndm.random() * 0.4;
     }
     hairColor = ColorFunctions.hsv2rgb(_loc8_,_loc13_,_loc15_);
     hairColor.bc = _loc2_;
  }
  if(param1.beardColor != null)
  {
     beardColor = param1.beardColor;
  }
  else if(Rndm.random() < 0.5)
  {
     beardColor = hairColor;
  }
  else
  {
     if(Rndm.random() < 0.9)
     {
        _loc5_ = ColorFunctions.rgb2hsv(hairColor.r,hairColor.g,hairColor.b);
        _loc8_ = _loc5_.h;
        _loc13_ = _loc5_.s;
        _loc15_ = _loc5_.v;
        _loc8_ += Rndm.random() * 10 - 5;
        _loc13_ += Rndm.random() * 10 - 5;
        _loc15_ += Rndm.random() * 10 - 5;
        if(_loc13_ > 100)
        {
           _loc13_ = 100;
        }
        if(_loc13_ < 0)
        {
           _loc13_ = 0;
        }
        if(_loc15_ > 100)
        {
           _loc15_ = 100;
        }
        if(_loc15_ < 0)
        {
           _loc15_ = 0;
        }
        _loc2_ = hairColor.bc - 0.1 + Rndm.random() * 0.2;
        while(_loc8_ < 0)
        {
           _loc8_ += 360;
        }
     }
     else
     {
        _loc8_ = Rndm.random() * 360;
        _loc13_ = 70 + Rndm.random() * 20;
        _loc15_ = 40 + Rndm.random() * 30;
        _loc2_ = 1;
     }
     beardColor = ColorFunctions.hsv2rgb(_loc8_,_loc13_,_loc15_);
     beardColor.bc = _loc2_;
  }
  if(param1.eyebrowsColor != null)
  {
     eyebrowsColor = param1.eyebrowsColor;
  }
  else
  {
     _loc5_ = ColorFunctions.rgb2hsv(hairColor.r,hairColor.g,hairColor.b);
     _loc8_ = _loc5_.h;
     _loc13_ = _loc5_.s;
     _loc15_ = _loc5_.v;
     _loc13_ += 5 + Rndm.random() * 10;
     _loc15_ -= 10 + Rndm.random() * 20;
     if(_loc13_ > 100)
     {
        _loc13_ = 100;
     }
     if(_loc15_ < 0)
     {
        _loc15_ = 0;
     }
     eyebrowsColor = ColorFunctions.hsv2rgb(_loc8_,_loc13_,_loc15_);
     eyebrowsColor.bc = hairColor.bc * 0.9;
  }
  if(param1.bristleColor == null)
  {
     _loc14_ = ColorFunctions.rgb2hsv(skinColor.r,skinColor.g,skinColor.b);
     _loc10_ = _loc14_.h;
     _loc18_ = _loc14_.s;
     _loc17_ = _loc14_.v;
     if(gender == 1 && Rndm.random() < 0.8 && age > 18)
     {
        _loc5_ = ColorFunctions.rgb2hsv(hairColor.r,hairColor.g,hairColor.b);
        _loc8_ = _loc5_.h;
        _loc13_ = _loc5_.s;
        _loc15_ = _loc5_.v;
        _loc13_ += 2 + Rndm.random() * 20;
        _loc15_ -= 20 + Rndm.random() * 50;
        if(_loc13_ > 100)
        {
           _loc13_ = 100;
        }
        if(_loc15_ < 0)
        {
           _loc15_ = 0;
        }
        _loc3_ = Math.min(Rndm.random() * (age / 18 - 1),1);
        _loc15_ = Math.min(_loc17_,_loc15_);
        _loc8_ = (_loc8_ * _loc3_ + _loc10_ * (1 - _loc3_)) / 2;
        _loc13_ = (_loc13_ * _loc3_ + _loc18_ * (1 - _loc3_)) / 2;
        _loc15_ = (_loc15_ * _loc3_ + _loc17_ * (1 - _loc3_)) / 2;
        _loc2_ = hairColor.bc * _loc3_ + skinColor.bc * (1 - _loc3_);
        bristleColor = ColorFunctions.hsv2rgb(_loc8_,_loc13_,_loc15_);
        bristleColor.bc = _loc2_;
     }
     else
     {
        _loc10_ += 5;
        _loc17_ -= 5;
        if(_loc10_ > 359)
        {
           _loc10_ = 359;
        }
        if(_loc17_ < 0)
        {
           _loc17_ = 0;
        }
        bristleColor = ColorFunctions.hsv2rgb(_loc10_,_loc18_,_loc17_);
        bristleColor.bc = skinColor.bc - 0.1;
     }
  }
  else
  {
     bristleColor = param1.bristleColor;
  }
  if(param1.hairColor == null && Rndm.random() < 0.05)
  {
     _loc8_ = Rndm.random() * 360;
     _loc13_ = 70 + Rndm.random() * 20;
     _loc15_ = 40 + Rndm.random() * 30;
     hairColor = ColorFunctions.hsv2rgb(_loc8_,_loc13_,_loc15_);
     hairColor.bc = 1;
     if(param1.beardColor == null && Rndm.random() < 0.5)
     {
        beardColor = hairColor;
     }
  }
  if(param1.eyesColor != null)
  {
     eyesColor = param1.eyesColor;
  }
  else
  {
     if(Rndm.random() < race)
     {
        _loc8_ = 120 + Rndm.random() * 130;
        _loc13_ = 5 + Rndm.random() * 30;
        _loc15_ = 40 + Rndm.random() * 20;
        _loc2_ = 1 + Rndm.random() * 0.2;
     }
     else
     {
        _loc8_ = Rndm.random() * 40;
        _loc13_ = 60 + Rndm.random() * 20;
        _loc15_ = Rndm.random() * 20;
        _loc2_ = 0.8 + Rndm.random() * 0.2;
     }
     eyesColor = ColorFunctions.hsv2rgb(_loc8_,_loc13_,_loc15_);
     eyesColor.bc = _loc2_;
  }
  if(param1.pantsColor == null)
  {
     _loc8_ = Rndm.integer(0,359);
     _loc13_ = Rndm.integer(0,30);
     _loc15_ = Rndm.integer(0,70);
     pantsColor = ColorFunctions.hsv2rgb(_loc8_,_loc13_,_loc15_);
     pantsColor.bc = 1 + Rndm.random() * 0.5;
  }
  else
  {
     pantsColor = param1.pantsColor;
  }
  if(param1.shoesColor == null)
  {
     _loc8_ = Rndm.integer(0,60);
     _loc13_ = Rndm.integer(30,70);
     _loc15_ = Rndm.integer(0,30);
     shoesColor = ColorFunctions.hsv2rgb(_loc8_,_loc13_,_loc15_);
     shoesColor.bc = 1;
  }
  else
  {
     shoesColor = param1.shoesColor;
  }
  if(param1.shirtColor == null)
  {
     _loc8_ = Rndm.integer(0,360);
     _loc13_ = Rndm.integer(0,20);
     _loc15_ = Rndm.integer(10,100);
     _loc13_ = Math.round(_loc13_ * ((150 - _loc15_) / 150));
     shirtColor = ColorFunctions.hsv2rgb(_loc8_,_loc13_,_loc15_);
     shirtColor.bc = 0.8 + Rndm.random() * 0.2;
  }
  else
  {
     shirtColor = param1.shirtColor;
  }
  if(param1.eyeSocketsColor == null)
  {
     _loc14_ = ColorFunctions.rgb2hsv(skinColor.r,skinColor.g,skinColor.b);
     _loc8_ = _loc14_.h;
     _loc13_ = _loc14_.s;
     _loc15_ = _loc14_.v;
     if(gender == 1 || Rndm.random() < 0.5)
     {
        if(Rndm.random() <= 0.05)
        {
           _loc8_ = 0;
           _loc13_ = 100;
           _loc15_ = 0;
        }
        else
        {
           _loc8_ -= Rndm.integer(2,10);
           _loc13_ += Rndm.integer(-5,10);
           _loc15_ -= Rndm.integer(0,3);
           _loc2_ = 0.85 + Rndm.random() * 0.2;
        }
     }
     else
     {
        _loc8_ = Rndm.integer(0,359);
        _loc13_ += Rndm.integer(0,20);
        _loc15_ -= Rndm.integer(5,20);
        _loc2_ = 0.75 + Rndm.random() * 0.2;
     }
     if(_loc8_ < 0)
     {
        _loc8_ = 0;
     }
     if(_loc13_ > 255)
     {
        _loc13_ = 255;
     }
     if(_loc13_ < 0)
     {
        _loc13_ = 0;
     }
     if(_loc15_ < 0)
     {
        _loc15_ = 0;
     }
     eyeSocketsColor = ColorFunctions.hsv2rgb(_loc8_,_loc13_,_loc15_);
     eyeSocketsColor.bc = _loc2_;
  }
  else
  {
     eyeSocketsColor = param1.eyeSocketsColor;
  }

  const raw: Record<string, any> = {skin: skinColor, hair: hairColor, lips: lipsColor, eyes: eyesColor,
    eyeSockets: eyeSocketsColor, eyebrows: eyebrowsColor, beard: beardColor, shirt: shirtColor,
    pants: pantsColor, shoes: shoesColor, bristle: bristleColor};
  const colors: Record<string, {r:number;g:number;b:number}> = {};
  for (const [key, c] of Object.entries(raw)) {
    colors[key] = {r: c.r * c.bc, g: c.g * c.bc, b: c.b * c.bc};
  }
  return colors;
}
